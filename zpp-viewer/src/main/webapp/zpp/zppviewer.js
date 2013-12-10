/**
 * --------------------------------------------------------------------
 * jQuery-Plugin "zppviewer"
 * by P. O. Pedersen, peder@carolus.dk
 *
 * Copyright (c) 2013 P. O. Pedersen
 * Version: 1.0, Nov. 14th 2013 
 *
 * Dependencies:
 * jQuery
 * jQuiery UI
 * http://eightmedia.github.io/hammer.js/
 * --------------------------------------------------------------------
**/

(function($){

  /** 
   * @name $.carolus.ZppViewer
   * @namespace ZppViewer widget
   */
  $.ZppViewer = function(){};

  $.widget("zpp.ZppViewer", {

    /********************************************/
    /** Initialization                         **/
    /********************************************/

    // Default options
    options: {
      debug:            false,
      autoRatio:        true,
      thumbnail:        false,
      showToolbar:      true,
      toolbarPos:       "bottom right",
      toolbarIconSize:  32
    },
    
    /**
     * First function to be called: triggers the plugin initialisation
     */
    _create: function() {
      
      // Make or break checks for canvas support
      this.canvas = this.element[0];
      if (this.canvas.nodeName.toLowerCase() !== "canvas") {
        alert("The ZppViewer must use a canvas, not a " + this.canvas.nodeName);
        throw "The ZppViewer must use a canvas, not a " + this.canvas.nodeName;
      }
      this.context  = this.canvas.getContext('2d');
      $(this.canvas).addClass("zppviewer");
      this.emptyImageUrl = $(this.canvas).css('background-image').replace(/^url\(["']?/, '').replace(/["']?\)$/, ''); 
      
      this.hasFocus         = false;
      this.trace            = false;
      
      // Options
      this.debug            = this.options.debug || this.element.attr("zpp-debug");
      this.showToolbar      = this.options.showToolbar || this.element.attr("zpp-showToolbar");
      this.toolbarPos       = this.options.toolbarPos || this.element.attr("zpp-toolbarPos") || "bottom";
      this.toolbarIconSize  = this.options.toolbarIconSize || this.element.attr("zpp-toolbarIconSize") || "32";
      this.thumbnail        = this.options.thumbnail || this.element.attr("zpp-thumbnail");
      this.src              = this.options.src || this.element.attr("zpp-src") || null;
      this.imageWidth       = this.options.imageWidth || this._attrIntValue("zpp-imageWidth");
      this.imageHeight      = this.options.imageHeight || this._attrIntValue("zpp-imageHeight");
      this.tileSize         = this.options.tileSize || this._attrIntValue("zpp-tileSize") || null;
      this.background       = this.options.background || this.element.attr("zpp-background");
      this.cssWidth         = this.cssWidth0  = parseInt($(this.canvas).css("width"));
      this.cssHeight        = this.cssHeight0 = parseInt($(this.canvas).css("height"));
      
      // If autoRatio is set, determine the ratio from the device
      if (this.options.autoRatio || this.element.attr("zpp-autoRatio")) {
        this._autoAdjustCanvasToPixelRatio();
      } else {
        // Stick to 1:1
        this.deviceRatio = 1.0;
      }
      this.width  = parseInt($(this.canvas).attr("width"));
      this.height = parseInt($(this.canvas).attr("height"));
      this.scale  = 1.0;
      this.offset = { "x": 0.0, "y": 0.0, "x0" : 0.0, "y0": 0.0 };
      
      // Register events
      this._bindEvents();
      
      // Pre-load the thumbnail, if requested
      if (this.thumbnail) {
        this._loadThumbnail();
      }
      
      // Create the toolbar
      if (this.showToolbar && this.showToolbar != "none") {
        this._createToolbar();
      }
    
      // Start loading images...
      if (!this.tileSize || !this.imageWidth || !this.imageHeight) {
        this._loadImageProperties();
      } else {
        this._log("Image dimensions specified: width=%d, height=%d, tile-size=%d", 
                    this.imageWidth, 
                    this.imageHeight, 
                    this.tileSize);
        this._calculateZoomLevels();
      }
    },
    
    _attrIntValue: function(name) {
      var val = this.element.attr(name);
      return (typeof val !== "undefined" && val) ? parseInt(val) : null;
    },
    
    /**
     * Mobile devices often have a super-pixel resolution.
     * See: http://www.html5rocks.com/en/tutorials/canvas/hidpi/
     */
    _autoAdjustCanvasToPixelRatio: function() {
        this.devicePixelRatio  = window.devicePixelRatio || 1,
        this.backingStoreRatio = this.context.webkitBackingStorePixelRatio ||
                                 this.context.mozBackingStorePixelRatio ||
                                 this.context.msBackingStorePixelRatio ||
                                 this.context.oBackingStorePixelRatio ||
                                 this.context.backingStorePixelRatio || 1;
        
        this.deviceRatio = this.devicePixelRatio / this.backingStoreRatio;
        if (this.devicePixelRatio !== this.backingStoreRatio) {
          this._log("Adjusting to pixel ratio %f", this.deviceRatio);
          this.cssWidth    = parseInt($(this.canvas).attr("width"));
          this.cssHeight   = parseInt($(this.canvas).attr("height"));
          $(this.canvas).attr("width",  Math.round(this.cssWidth  * this.deviceRatio));
          $(this.canvas).attr("height", Math.round(this.cssHeight * this.deviceRatio));
          $(this.canvas).css("width",   this.cssWidth);
          $(this.canvas).css("height",  this.cssHeight);
          this.context.scale(this.deviceRatio, this.deviceRatio);
        }
    },
    
    /********************************************/
    /** Toolbar                                **/
    /********************************************/
    
    _createToolbar: function() {
    	this.toolbar = { x: 0, y: 0, w: 0, h: 0 };
      this._createToolbarBtn("homeBtn", "btn_home.png", 0, $.proxy(this._reset, this));
      this._createToolbarBtn("zoomInBtn", "btn_zoomIn.png", 1, $.proxy(this._zoomIn, this, 1.2));
      this._createToolbarBtn("zoomOutBtn", "btn_zoomOut.png", 2, $.proxy(this._zoomOut, this, 1.2));
      if (this._supportsFullscreen()) {
        this._createToolbarBtn("startFullscreenBtn", "btn_startFullscreen.png", 3, $.proxy(this._toggleFullscreen, this));
        this._createToolbarBtn("stopFullscreenBtn", "btn_stopFullscreen.png", 3, $.proxy(this._toggleFullscreen, this));
      }
      
      // position the toolbar
      this._positionToolbar();
    },
    
    _createToolbarBtn: function(name, defaultUrl, index, action) {
      this.toolbar[name] = { name: name, index: index, action: action, image: null, x:0, y:0 };
      // Load image
      var img = new Image();
      img.onload = $.proxy(this._toolbarBtnLoaded, this, img, this.toolbar[name]);
      var src = this.options[name] || this.element.attr("zpp-" + name);
      if (!src) {
        src = this.emptyImageUrl.substr(0, this.emptyImageUrl.lastIndexOf("/"))
              + "/" + defaultUrl;
      }
      img.src = src;
    },
    
    _toolbarBtnLoaded: function(img, btn) {
      btn.image = img;
      this._log("Loaded toolbar btn '" + btn + "' from " + img.src);
    },
    
    _getTookbarButtons: function() {
      var buttons = [];
      if (this.toolbar) {
        buttons = [this.toolbar["homeBtn"], this.toolbar["zoomInBtn"], this.toolbar["zoomOutBtn"]];
        if (!this._isFullscreen() && this.toolbar["startFullscreenBtn"]) {
          buttons.push(this.toolbar["startFullscreenBtn"]);
        } else if (this.toolbar["stopFullscreenBtn"]) {
          buttons.push(this.toolbar["stopFullscreenBtn"]);
        }
      }  
      return buttons;
    },
    
    _positionToolbar: function() {
      var offset  = 5;
      var top     = (this.toolbarPos.indexOf("top")     !== -1);
      var left    = (this.toolbarPos.indexOf("left")    !== -1);
      var bottom  = (this.toolbarPos.indexOf("bottom")  !== -1);
      var right   = (this.toolbarPos.indexOf("right")   !== -1);
      var size    = parseInt(this.toolbarIconSize);
      var count   = (this._supportsFullscreen()) ? 4 : 3;
      var horiz   = (top || bottom);
      
      this.toolbar.w = (horiz)  ? count * (size + offset) + offset : size + 2 * offset;
      this.toolbar.h = (!horiz) ? count * (size + offset) + offset : size + 2 * offset;
      this.toolbar.x = (left) ? 0 : ((right) ? this.cssWidth - this.toolbar.w : Math.round((this.cssWidth - this.toolbar.w) / 2));
      this.toolbar.y = (top)  ? 0 : ((bottom) ? this.cssHeight - this.toolbar.h : Math.round((this.cssHeight - this.toolbar.h) / 2));
      var names = ["homeBtn", "zoomInBtn", "zoomOutBtn", "startFullscreenBtn", "stopFullscreenBtn"];
      for (var i = 0; i < names.length; i++) {
        var btn = this.toolbar[names[i]];
        if (btn) {
          btn.x = this.toolbar.x + offset + (size + offset) * ((horiz)  ? btn.index : 0);
          btn.y = this.toolbar.y + offset + (size + offset) * ((!horiz) ? btn.index : 0);
        }
      }
    },
    
    /********************************************/
    /** Events                                 **/
    /********************************************/

    _bindEvents: function() {
      var self = this;
      
      $(this.canvas)
        .bind("DOMMouseScroll mousewheel", $.proxy(this._onMouseWheel, this))
        .focus($.proxy(this._onFocus, this))
        .blur($.proxy(this._onBlur, this));
      
      $(this.canvas)
        .hammer({prevent_default: true})
        .bind('tap',        $.proxy(this._onTap, this))
        .bind('doubletap',  $.proxy(this._zoomIn, this, 2.0))
        .bind('dragstart',  $.proxy(this._saveOffset, this))
        .bind('drag',       $.proxy(this._onDrag, this))
        .bind('pinchin',    $.proxy(this._onPinch, this))
        .bind('pinchout',   $.proxy(this._onPinch, this))
        .bind("keyup",      $.proxy(this._onKeyup, this))
        .bind("release",    $.proxy(this._onRelease, this));
        
      $(document).bind('webkitfullscreenchange mozfullscreenchange fullscreenchange',
                       $.proxy(this._onFullscreenChange, this));
      $(window).resize($.proxy(this._onResize, this));
    },
    
    /**
     * Called when the canvas get focused
     */
    _onFocus: function(e) {
      e.preventDefault();
      this.hasFocus = true;
      this._repaint();
    },
    
    /**
     * Called when the canvas looses focus
     */
    _onBlur: function(e) {
      e.preventDefault();
      this.hasFocus = false;
      this._repaint();
    },
    
    /**
     * Called when the canvas is clicked/tapped
     */
    _onTap: function(e) {
      if (!this.hasFocus) {
        $(this.canvas).focus();
        
      } else {
        var loc     = this._getCanvasPoint(e);
        this._log("Tap at %s,%s", loc.x, loc.y);         
        var size    = parseInt(this.toolbarIconSize);
        var buttons = this._getTookbarButtons();
        for (var i = 0; i < buttons.length; i++) {
          var btn = buttons[i];
          if (loc.x > btn.x && loc.x < btn.x + size && 
              loc.y > btn.y && loc.y < btn.y + size) {
            btn.action();
            e.preventDefault();
            break;
          }
        }
      }
    },
    
    /**
     * Handle key up events
     */
    _onKeyup: function(e) {
      var code = e.keyCode || e.which;
      //alert("C " + code);
      switch (code) {
        case 70: // f   
          this._toggleFullscreen();
          break;
          
        case 27: // Escape  
          $(this.canvas).blur();
          break;

        case 107:
        case 171:
        case 187: // Add
          this._zoomIn(1.1);
          break;

        case 109:
        case 173:
        case 189: // Subtract  
          this._zoomOut(1.1);
          break;
      }
    },
    
    /**
     * Handle mouse wheel events
     */
    _onMouseWheel: function(e) {
      e.preventDefault();
      var zoomout = ((e.type == "DOMMouseScroll" && e.originalEvent.detail > 0) || 
                     (e.type == "mousewheel" && e.originalEvent.wheelDelta < 0));
      if (zoomout) {
        this._zoomOut(1.1, e);
      } else {
        this._zoomIn(1.1, e);
      }
    },

    /**
     * Handle drag events
     */
    _onDrag: function(e) {
      e.preventDefault();
      
      // Somehow, drag gets called at the end of pinch. Bail if this started as a pinch
      if (this._wasPinchEvent(e)) {
        return;
      }
      
      this.offset.x = this.offset.x0 + e.gesture.deltaX * this.deviceRatio;
      this.offset.y = this.offset.y0 + e.gesture.deltaY * this.deviceRatio;
      
      this._requestRepaint();
    },

    /**
     * Returns if the event is part of a pinch event
     */
    _wasPinchEvent: function(e) {
      return (typeof e.gesture.startEvent.scale0 == "undefined") ? false : true;
    },

    /**
     * Handle pinch events
     */
    _onPinch: function(e) {
      e.preventDefault();
      
      // Record the initial scale and offset
      if (!e.gesture.startEvent) {
        return;
      }
      if (!this._wasPinchEvent(e)) {
        e.gesture.startEvent.scale0 = this.scale;
        e.gesture.startEvent.x0 = this.offset.x;
        e.gesture.startEvent.y0 = this.offset.y;
        e.gesture.startEvent.cx0 = e.gesture.center.pageX;
        e.gesture.startEvent.cy0 = e.gesture.center.pageY;
      }
      
      // Scale
      this.scale = e.gesture.startEvent.scale0 * e.gesture.scale;
      this._adjustScale();
      
      // Determine center of pinch
      var loc = this._pageToCanvas(e.gesture.startEvent.cx0, e.gesture.startEvent.cy0);
      
      // Translate to device coordinates
      loc.x = loc.x * this.deviceRatio;
      loc.y = loc.y * this.deviceRatio;
      
      // Adjust the image offset relative to the mouse point
      var factor = this.scale / e.gesture.startEvent.scale0;
      this.offset.x = loc.x - (loc.x - e.gesture.startEvent.x0) * factor;
      this.offset.y = loc.y - (loc.y - e.gesture.startEvent.y0) * factor;
      
      this._requestRepaint();
    },
    
    /**
     * Handle release events
     * Updates the zoom level at the end of a pinch operation
     */
    _onRelease: function(e) {
      e.preventDefault();
      if (this._wasPinchEvent(e)) {
        this._checkZoomLevelAsync();
        this._requestRepaint();
      }
    },
    
    /**
     * Handle window resize events (fullscreen changes)
     */
    _onResize: function(e) {
    },
    
    /**
     * Called when the fullscren state changes
     */
    _onFullscreenChange: function(e) {
      if (this._isFullscreen()) {
        // Enter fullscreen
        this.cssWidth   = screen.width;
        this.cssHeight  = screen.height;
        
      } else {
        // Restore state
        $(this.canvas).removeClass("zppFullScreen");
        this.cssWidth   = this.cssWidth0;
        this.cssHeight  = this.cssHeight0;
      } 
      
        this.width  = Math.round(this.cssWidth  / this.deviceRatio);
        this.height = Math.round(this.cssHeight / this.deviceRatio);
        $(this.canvas).css("width", this.cssWidth);
        $(this.canvas).css("height", this.cssHeight);
        $(this.canvas).attr("width",  this.width);
        $(this.canvas).attr("height", this.height);

      this._reset();      
    },
    
    /********************************************/
    /** OPERATIONS                             **/
    /********************************************/

    /**
     * Resets current zoom level
     */
    _reset: function() {
      // Refresh the zoom level
      if (typeof this.level != "undefined") { 
        this._releaseImages(this.zoomLevels[this.level]);
      }
      delete this.level;
      this._loadZoomLevel();
      this._positionToolbar();
      this._repaint();
    },
    
    /**
     * Records the current offset
     */
    _saveOffset: function() {
      this.offset.x0 = this.offset.x;  
      this.offset.y0 = this.offset.y;  
    },
    
    /**
     * Checks if the fullscreen mode is supported
     */
    _supportsFullscreen: function() {
      return  this.canvas.requestFullscreen     || 
              this.canvas.mozRequestFullScreen  || 
              this.canvas.webkitRequestFullscreen;
    },
    
    /**
     * Returns if the canvas is in fullscreen mode
     */
    _isFullscreen: function() {
      return  document.fullscreenElement     || 
              document.mozFullScreenElement  || 
              document.webkitFullscreenElement;
    },
    
    /**
     * Toggles fullscreen mode
     */
    _toggleFullscreen: function() {
      // Check if fullscreen is supported
      if (!this._supportsFullscreen()) {
        alert("Fullscreen mode not supported");
        return;
      }
    
      if (!this._isFullscreen()) { 
          
        // Preserve pre-fullscale size
        this.cssWidth0  = parseInt($(this.canvas).css("width"));
        this.cssHeight0 = parseInt($(this.canvas).css("height"));
        $(this.canvas).addClass("zppFullScreen");
        if (this.canvas.requestFullscreen) {
          this.canvas.requestFullscreen();
        } else if (this.canvas.mozRequestFullScreen) {
          this.canvas.mozRequestFullScreen();
        } else if (this.canvas.webkitRequestFullscreen) {
          this.canvas.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
        }
        
      } else {
        if (document.cancelFullScreen) {
          document.cancelFullScreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.webkitCancelFullScreen) {
          document.webkitCancelFullScreen();
        }
        $(this.canvas).removeClass("zppFullScreen");
      }
    },

    /**
     * Zooms in
     */
    _zoomIn: function(factor, e) {
      this._zoom((factor) ? factor : 1.1, e);
    },

    /**
     * Zooms out
     */
    _zoomOut: function(factor, e) {
      this._zoom((factor) ? 1.0/factor : 1.0/1.1, e);
    },

    /**
     * Zooms to the given scale
     */
    _zoom: function(factor, e) {
      var loc = this._getCanvasPoint(e);
      
      // Scale
      var saveScale = this.scale;
      this.scale *= factor;
      this._adjustScale();
      
      // Check if we succeeded in changing the scale
      if (Math.abs(this.scale - saveScale) > 0.001) { 
        factor = this.scale / saveScale;
        
        // Translate to device coordinates
        loc.x = loc.x * this.deviceRatio;
        loc.y = loc.y * this.deviceRatio;
        
        // Adjust the image offset relative to the mouse point
        this.offset.x = loc.x - (loc.x - this.offset.x) * factor;
        this.offset.y = loc.y - (loc.y - this.offset.y) * factor;
        
        // Check if the zoom level should be changed
        this._checkZoomLevelAsync();
        this._requestRepaint();
      }
    },
    
    /**
     * Returns the mouse location for various type of events
     * within the canvas
     */
    _getCanvasPoint: function(e) {
      // Determine canvas location
      var loc = { "x": this.canvas.width / 2.0, "y": this.canvas.height / 2.0 };
      if (e) {
        if (e.type == "DOMMouseScroll" || e.type == "mousewheel") {
          loc = this._pageToCanvas(e.originalEvent.pageX, e.originalEvent.pageY); 
        } else if (e.type == "doubletap" || e.type == "tap") {
          loc = this._pageToCanvas(e.gesture.center.pageX, e.gesture.center.pageY);
        } else if (e.type == "click") {
          loc = this._pageToCanvas(e.pageX, e.pageY);
        }
      }
      return loc;
    },
    
    _pageToCanvas: function(pageX, pageY) {
      var canvasOffset = $(this.canvas).offset();
      return { "x": pageX - canvasOffset.left, "y": pageY - canvasOffset.top};
    },
    
    /********************************************/
    /** LOADING                                **/
    /********************************************/

    /**
     * Loads the "ImageProperties.xml" image meta file from the server
     * and initializes the viewer
     */
    _loadImageProperties: function() {
      this._log("Loading ZppViewer");

      var self = this;
      delete self.imageWidth;
      delete self.imageHeight;
      delete self.tileSize;
      $.ajax({
        url: this.src + "/ImageProperties.xml",
        context:self,
        success: function(data) {
          var imgXml = data;
          // Safari and Firefox returns different types!?!?!
          if (typeof data == 'string' || data instanceof String) {
            imgXml = $.parseXML(data);
          }
          imgXml = $(imgXml).find("IMAGE_PROPERTIES");
          self.imageWidth = parseInt($(imgXml).attr("WIDTH"));
          self.imageHeight = parseInt($(imgXml).attr("HEIGHT"));
          self.tileSize = parseInt($(imgXml).attr("TILESIZE"));
          
          if (!data || !self.imageWidth || !self.imageHeight || !self.tileSize) {
            console.error("Not a properly formatted " + this.src + "/ImageProperties.xml");
          } else {
            // Hurrah!
            this._log("Loaded " + this.src + "/ImageProperties.xml: width=%d, height=%d, tile-size=%d", 
                      this.imageWidth, 
                      this.imageHeight, 
                      this.tileSize);
            this._calculateZoomLevels();
          }
        },
        error: function() {
          console.error("Unable to load " + this.src + "/ImageProperties.xml");
        },
      });
    },

    /**
     * Calculates hte zoom levels from the image dimension and tile size
     */
    _calculateZoomLevels: function() {
      this.zoomLevels = [];
      
      // Compute the zoom levels
      var w = this.imageWidth;
      var h = this.imageHeight;
      while (true) {
        this.zoomLevels.push({ 
              level:        0,            // TBD: Level
              imageWidth:   w,            // Image width at zoom level
              imageHeight:  h,            // Image height at zoom level
              horizTileNo:  Math.ceil(w / this.tileSize), // Horizontal tile no
              vertTileNo:   Math.ceil(h / this.tileSize), // Vertical tile no
              tileGroup:    new Array(),  // TBD: Zoomify TileGroup index 
              images:       new Array(),  // TBD: The loaded images 
              loading:      new Array()   // TBD: The images being loaded 
              });
        if (Math.max(w, h) <= this.tileSize) {
          break;
        }
        w = Math.floor(w / 2);
        h = Math.floor(h / 2);
      };
      this.zoomLevels.reverse();

      // Compute the tile group indexes.
      // In Zoomify, there are at most 256 images in each TileGroup folder
      var index = 0, tileGroup = 0;
      for (var z = 0; z < this.zoomLevels.length; z++) {
        var zoomLevel =  this.zoomLevels[z];
        zoomLevel.level = z;
        for (var x = 0; x < zoomLevel.horizTileNo * zoomLevel.vertTileNo; x++) {
          zoomLevel.tileGroup.push(tileGroup);
          if (++index >= 256) {
            index = 0;
            tileGroup++;
          }
        }
      }

      this._log("#Zoom levels " + this.zoomLevels.length);
      
      // Load the images
      this._loadZoomLevel();
    },

    /**
     * Schedules a zoom level check in 200 ms
     */
    _checkZoomLevelAsync: function() {
      
      if (this.checkZoomLevelTimer) {
        clearTimeout(this.checkZoomLevelTimer);
      }
      var self = this;
      this.checkZoomLevelTimer = setTimeout(function(){
        self._checkZoomLevel();
        delete self.checkZoomLevelTimer;
      }, 200);
    },

    /**
     * Checks the current zoom level
     * - wheter to load a new zoom level or not
     */
    _checkZoomLevel: function() {
      var saveLevel = this.level;
      
      while (this.scale > 1.01 && this.level < this.zoomLevels.length - 1) {
        this.level++;
        this.scale /= 2.0;
        this._adjustScale();
      } 
      while (this.scale < 0.5 && this.level > 0) {
        this.level--;
        this.scale *= 2.0;
        this._adjustScale();
      }
      
      // Check if the level was changed
      if (this.level != saveLevel) {
        this._releaseImages(this.zoomLevels[saveLevel]);
        this._loadZoomLevel();
      }
    },
    
    /**
     * Loads the images at the given zoom level
     */
    _loadZoomLevel: function() {
      if (typeof this.level == "undefined") {
        this.offset.x = 0;
        this.offset.y = 0;
        this._computeZoomLevelAndScale();
      }
      this._log("Loading zoom level " + this.level);
      
      var zoomLevel =  this.zoomLevels[this.level];
      this._releaseImages(zoomLevel);
      
      // Compute the tiles that should be reloaded
      var tiles = this._computeRepaintTiles();
       for (var y = tiles.y; y < tiles.y + tiles.h; y++) {
        for (var x = tiles.x; x < tiles.x + tiles.w; x++) {
          this._loadImage(zoomLevel, x, y);
        }
      }
    },
    
    /**
     * Releases memory from loaded images for all zoom levels
     */
    _releaseAllImages: function() {
      for (zoomlevel in this.zoomlevels) {
        _releaseImages(zoomlevel);
      }
    },
    
    /**
     * Releases memory from loaded images for the given zoom level
     */
    _releaseImages: function(zoomlevel) {
      for (img in zoomlevel.images) {
        this._releaseImage(img);
      }
      delete zoomlevel.images;
      zoomlevel.images = new Array();
      for (img in zoomlevel.loading) {
        this._releaseImage(img);
      }
      delete zoomlevel.loading;
      zoomlevel.loading = new Array();
    },
    
    /**
     * Release all images ouside the given tiles bounding box
     */
    _releaseImagesOutsideTiles: function(zoomLevel, tiles) {
      for (var y = 0; y < zoomLevel.vertTileNo; y++) {
        for (var x = 0; x < zoomLevel.horizTileNo; x++) {
          if (y < tiles.y || y >= tiles.y + tiles.h ||
              x < tiles.x || x >= tiles.x + tiles.w) {
            var index = y * zoomLevel.horizTileNo + x;
            if (zoomLevel.images[index] != null) {
              this._releaseImage(zoomLevel.images[index]);
              zoomLevel.images[index] = null;
              //this._log("Releasing cached image " + x + ", " + y);
            }
            if (zoomLevel.loading[index] != null) {
              this._releaseImage(zoomLevel.loading[index]);
              zoomLevel.loading[index] = null;
              //this._log("Releasing loading image " + x + ", " + y);
            }
          }
        }
      }
    },
    
    /**
     * It's not easy to get the browser to release the memory of loaded images.
     * The most robust solution seems to be to point the image "src" attribute
     * to a dummy image...
     */
    _releaseImage: function(img) {
      if (img != null) {
        img.onload = null;
        img.src = this.emptyImageUrl;
        //img.src = null;
        //delete img.src;
      }
    },
    
    /**
     * Loads the given image
     */
    _loadImage: function(zoomLevel, x, y) {
      var index = y * zoomLevel.horizTileNo + x;
      
      // Check if it is already being loaded
      if (zoomLevel.loading[index] != null) {
        return;
      }
      
      var tileGroup = zoomLevel.tileGroup[index];
      var self = this;
      var src = this.src 
                  + "/TileGroup" + tileGroup
                  + "/" + zoomLevel.level + "-" + x + "-" + y + ".jpg";
      //this._log("Loading %s", src);
      var img = new Image();
      img.setAttribute("tileX", x);
      img.setAttribute("tileY", y);
      img.setAttribute("level", zoomLevel.level);
      img.onload = $.proxy(this._imageLoaded, this, img);
      zoomLevel.loading[index] = img;
      // Trigger the actual loading of the image
      img.src = src;      
    },
    
    /**
     * Loads the thumbnail image
     */
    _loadThumbnail: function() {
      var self = this;
      var src = this.src + "/TileGroup0/0-0-0.jpg";
      this._log("Loading thumbnail %s", src);
      var img = new Image();
      img.onload = function() { self.thumbImage = this; };
      // Trigger the actual loading of the thumbnail
      img.src = src;      
    },
    
    /**
     * Callback when an image is loaded
     */
    _imageLoaded: function(img) {
      var level = parseInt(img.getAttribute("level"));
      var zoomLevel = this.zoomLevels[level];
      var x = parseInt(img.getAttribute("tileX"));
      var y = parseInt(img.getAttribute("tileY"));
      var index = y * zoomLevel.horizTileNo + x;
      zoomLevel.loading[index] = null;
      if (this.level == level) {
        zoomLevel.images[index] = img;
        this._repaint();
      } else {
        this._releaseImage(img);
      }
    },

    /**
     * Returns the cached image for the given tile and zoom level
     */
    _getImage: function(zoomLevel, x, y) {
      var index = y * zoomLevel.horizTileNo + x;
      if (zoomLevel.images[index] != null) {
        return zoomLevel.images[index];
      };
      return null;
    },
    
    /**
     * Compute the current zoom level based on the 
     * image size and the canvas size
     */
    _computeZoomLevelAndScale: function() {
      // First establish a zoom level that has at minimum
      // the resolution of the canvas
      this.level = 0; // Thumbnail size
      while (this.level < this.zoomLevels.length - 1 &&
             this.zoomLevels[this.level].imageWidth < this.width && 
             this.zoomLevels[this.level].imageHeight < this.height) {
        this.level++;
      }
      
      // Next, determine how much the image of the zoom level
      // should be scaled to fit inside the canvas.
      // We never scale up - instead we center within the canvas
      var scaleX = this.width / this.zoomLevels[this.level].imageWidth;
      var scaleY = this.height / this.zoomLevels[this.level].imageHeight;
      this.scale = Math.min(1.0, Math.min(scaleX, scaleY)); 
      this._adjustScale();
    },

    /**
     * Counts the cached images for the current level
     */
    _countCachedImageNo: function() {
      var cnt = 0;
      var images = this.zoomLevels[this.level].images;
      for (var index = 0; index < images.length; index++) {
        if (images[index] != null) cnt++;
      }
      return cnt;
    },
    
    /**
     * Counts the number of images being loaded for the current level
     */
    _countLoadingImageNo: function() {
      var cnt = 0;
      var images = this.zoomLevels[this.level].loading;
      for (var index = 0; index < images.length; index++) {
        if (images[index] != null) cnt++;
      }
      return cnt;
    },
    
    /********************************************/
    /** PAINTING                               **/
    /********************************************/
    
    _round: function(val) { return Math.round(val / this.deviceRatio); },
    _floor: function(val) { return Math.floor(val / this.deviceRatio); },
    _ceil:  function(val) { return Math.ceil (val / this.deviceRatio); },
    
    /**
     * Schedules a repaint in 100 ms
     */
    _repaint: function() {
      var now = new Date().getTime();
      //if (this.repaintTimer && this.lastRepaintTime && now - this.lastRepaintTime < 100) {
      if (this.repaintTimer) {
        clearTimeout(this.repaintTimer);
      }
      var self = this;
      this.repaintTimer = setTimeout(function(){
        self._repaintZoomLevel();
        delete self.repaintTimer;
      }, 100);
    },

    /**
     * Schedules a repaint using built in support
     */
    _requestRepaint: function() {
      reqAnimFrame = window.mozRequestAnimationFrame    ||
                     window.webkitRequestAnimationFrame ||
                     window.msRequestAnimationFrame     ||
                     window.oRequestAnimationFrame;
      reqAnimFrame($.proxy(this._repaintZoomLevel, this));
    },

    /**
     * Repaints the current zoom level
     */
    _repaintZoomLevel: function() {
      this.lastRepaintTime = new Date().getTime();
    
      // Clear the canvas
      if (this.background) {
        this.context.fillStyle = this.background;
        this.context.fillRect (0, 0, this.width, this.height);
      } else {
        this.context.clearRect (0, 0, this.width, this.height);
      }
    
      // Adjust the image offset to center an image smaller than the canvas
      this._adjustImageOffset();
    
      // Compute the tiles that should be reloaded
      var tiles = this._computeRepaintTiles();
      var zoomLevel = this.zoomLevels[this.level];

      if (this.thumbImage) {
          var factor = this.thumbImage.width / (zoomLevel.imageWidth * this.scale);
          this.context.save();
          this.context.rect(0, 0, this.width, this.height);
          this.context.clip();
          this.context.drawImage(
            this.thumbImage, 
            0, 0, this.thumbImage.width, this.thumbImage.height,
            this._floor(this.offset.x),
            this._floor(this.offset.y),
            this._ceil(zoomLevel.imageWidth * this.scale),
            this._ceil(zoomLevel.imageHeight * this.scale));
          this.context.restore();
      }
      
      for (var y = tiles.y; y < tiles.y + tiles.h; y++) {
        for (var x = tiles.x; x < tiles.x + tiles.w; x++) {
          var img = this._getImage(zoomLevel, x, y);
          if (img) {
            var imageX = x * this.tileSize;
            var imageY = y * this.tileSize;
            this.context.drawImage(
              img, 
              this._floor(this.offset.x + imageX * this.scale),
              this._floor(this.offset.y + imageY * this.scale),
              this._ceil(img.width * this.scale),
              this._ceil(img.height * this.scale));
          } else {
            // Start loading the image
            this._loadImage(zoomLevel, x, y);
          }
          
          if (this.trace) {
            this.context.beginPath();
            this.context.lineWidth="2";
            this.context.strokeStyle="black";
            this.context.rect( 
              this._floor(this.offset.x + x * this.tileSize * this.scale),
              this._floor(this.offset.y + y * this.tileSize * this.scale),
              this._ceil(this.tileSize * this.scale),
              this._ceil(this.tileSize * this.scale));
            this.context.stroke();          
          }
        }
      }
      
      if (this.toolbar && this.hasFocus) {
        this._repaintToolbar();
      }
      
      // Un-cache images outside the the current tile set
      this._releaseImagesOutsideTiles(zoomLevel, tiles);
      
      if (this.trace) {
        var txt = "size " + this.width + ", " + this.height
                + ", scale=" + this.scale.toFixed(2) + ", level=" + this.level
                + ", tiles=(" + tiles.x + "," + tiles.y + "," + tiles.w + "," + tiles.h 
                + "), cached images=" + this._countCachedImageNo();
        var metrics = this.context.measureText(txt);
        this.context.fillStyle = "rgba(200,200,200,0.5)";
        this.context.fillRect (0, 0, parseInt(metrics.width) + 15, 15);
        this.context.fillStyle = "black";
        this.context.fillText(txt, 10, 10);
      }
    },
    
    /**
     * Repaints the toolbar 
     */
    _repaintToolbar: function() {
      this.context.save();
      this.context.globalAlpha = 0.3;
      
      this.context.fillStyle = "#777777";
      this.context.fillRect (this.toolbar.x, this.toolbar.y, this.toolbar.w, this.toolbar.h);
      
      var size    = parseInt(this.toolbarIconSize);
      var buttons = this._getTookbarButtons();
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        if (btn.image) {
          this.context.drawImage(
            btn.image, 
            0, 0, btn.image.width, btn.image.height,
            btn.x, btn.y, size, size);
        }
      }
      this.context.restore();
    },
    
    /**
     * Computes the indexes of that should be repainted
     */
    _computeRepaintTiles: function() {
      var zoomLevel = this.zoomLevels[this.level];
      // Intersection of image and frame 
      var x = Math.max(0.0, -this.offset.x / this.scale),
          y = Math.max(0.0, -this.offset.y / this.scale),
          w = Math.min(this.width / this.scale, zoomLevel.imageWidth),
          h = Math.min(this.height / this.scale, zoomLevel.imageHeight);

      var tileX = Math.floor(x / this.tileSize),
          tileY = Math.floor(y / this.tileSize),
          tileW = Math.ceil((x + w) / this.tileSize) - tileX,
          tileH = Math.ceil((y + h) / this.tileSize) - tileY;

      return { x: tileX, y: tileY, w: tileW, h: tileH };
    },
    
    /**
     * Adjusts the offset to center an image smaller than the canvas
     */
    _adjustImageOffset: function() {
      // Center, if the image is too small for the canvas
      var scaledWidth = this.zoomLevels[this.level].imageWidth * this.scale;
      var scaledHeight = this.zoomLevels[this.level].imageHeight * this.scale;
      var dw = (this.width - scaledWidth),
          dh = (this.height - scaledHeight);
      if (dw > 0) {
        this.offset.x = dw / 2.0;
      } else if (this.offset.x > 0) {
        this.offset.x = 0;
      } else if (this.offset.x + scaledWidth < this.width) {
        this.offset.x = this.width - scaledWidth;
      } 
      
      if (dh > 0) {
        this.offset.y = dh / 2.0;
      } else if (this.offset.y > 0) {
        this.offset.y = 0;
      } else if (this.offset.y + scaledHeight < this.height) {
        this.offset.y = this.height - scaledHeight;
      }
    },

    /**
     * Ensure that we never show a higher or lower resolution
     * than the resolutions available.
     * Returns whether the scale was adjusted
     */
    _adjustScale: function() {
      var scaledWidth = this.zoomLevels[this.level].imageWidth * this.scale;
      var scaledHeight = this.zoomLevels[this.level].imageHeight * this.scale;
      if (scaledWidth < this.zoomLevels[0].imageWidth) {
        this.scale = this.zoomLevels[0].imageWidth / this.zoomLevels[this.level].imageWidth;
        return true;
      } else if (scaledWidth > this.zoomLevels[this.zoomLevels.length - 1].imageWidth) {
        this.scale = this.zoomLevels[this.zoomLevels.length - 1].imageWidth / this.zoomLevels[this.level].imageWidth;
        return true;
      }
      return false;
    },
    
    /********************************************/
    /** Misc                                   **/
    /********************************************/

    /**
     * If debugging is enabled, logs to the console
     */
    _log: function() {
      if (this.debug) {
        if (typeof(console) !== "undefined" && console.log !== undefined) {
          try {
            console.log.apply(console, arguments);
          } catch (e) {
            var log = Function.prototype.bind.call(console.log, console);
            log.apply(console, arguments);
          }
        }
      }
    },

    destroy: function() {
      $.Widget.prototype.destroy.apply(this, arguments); 
      this._releaseAllImages();
      if (this.thumbImage) {
        this._releaseImage(this.thumbImage);
        delete this.thumbImage;
      }
	  },
	
    version: function(){
		  return "1.1.0";
  	}
  });
})(jQuery);
