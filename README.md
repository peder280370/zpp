# Zpp Image Viewer and Server

Zpp (a.k.a Zoomify++) consists of multiple modules that provide server and client support for the Zoomify image format.

### Client Module
The `zpp-viewer` moduels contains a jQuery UI module, ***ZppViewer*** for displaying Zoomify images. Features:

* HTML5 only - it uses canvas for displaying the image.
* Proper fullscreen mode on supported platforms.
* Mouse and gestures (tablet) supported.
* High DPI (retina-style screens) supported.

The ZppViewer depends on **jQuery**, **jQuery UI** and **Hammer.js**.

Example configuration:

    <html>
      <head>
        <script src="http://ajax.googleapis.com/ajax/libs/jquery/2.0.3/jquery.min.js"></script>
        <script src="http://ajax.googleapis.com/ajax/libs/jqueryui/1.10.3/jquery-ui.min.js"></script>
        <script src="js/jquery.hammer.min.js"></script>
        <script src="zpp/zppviewer.min.js" type="text/javascript"></script>
        <link href="zpp/zppviewer.css" rel="stylesheet" />
        <script type="text/javascript">
          $(document).ready(function() {
    	    $("canvas").ZppViewer({ autoRatio: true, thumbnail: true });
          });
        </script>
      </head>
      <body>
        <h1>Pyramid tiff example</h1>
        <canvas id="img1" tabindex="1" width="300" height="200" 
                zpp-src="zpprepo/zpp_image1.tif" ></canvas>
        <h1>Zoomify file bundle example</h1>
        <canvas id="img2" tabindex="2" width="300" height="200" 
                zpp-src="zpprepo/zpp_image2" ></canvas>
      </body>
    </html>

### Server Modules
The `zpp-native` module contains a C++/JNI interface to **libtiff** and **libjpeg** and provides a Zoomify-protocol interface to tiled pyramid tiff images.
The `zpp-svr` module is a simple web application that depends on `zpp-viewer` and `zpp-native`.

#### Testing zpp-svr
 
In the root of the `zpp` module, run:

    mvn install
    cd zpp-svr
    mvn tomcat7:run
    # Alternatively: mvn jetty:run

Currently, there are only Mac OS X Makefiles. If you use Linux, please add Linux-flavoured Makefiles and update the respective pom.xml files with a "Linux" profile.

### Misc Modules
The `zpp-vips` module contains a C++ application, which is essentially just a thin shell on top of ***libvips***. First of all, it *always* auto-rotates the image, if specified by the exif rotation header, and it allows you to chain certain VIPS operations, e.g.:

    zpp_vips image.jpg result.jpg -rotate 17 -resize 500 0 -crop 100 100 50 50
    zpp_vips image.jpg result.tif:jpeg:85,tile:256x256,pyramid -sharpen
    zpp_vips image.jpg result -resize 2000 2000 -zoomify 256

The `testrepo` module, merely serves as an image repository for the `zpp-svr` module. It contains sample images.


## Generating Zoomify Images

It is highly recommended using ***libvips***. Examples:

    # Generating a tiled ptiff:
    vips im_vips2tiff image.jpg \ 
         result.tif:jpeg:85,tile:256x256,pyramid
    
    # Generating a Zoomify file bundle:
    vips dzsave image.jpg result \ 
         --layout zoomify \
         --tile-size 256 \
         --suffix .jpg[Q=85]
    
