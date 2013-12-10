/**  ZppImage class
 *   Copyright (C) 2013 P. O. Pedersen, Carolus IT Services.
 */

#ifndef _ZPPIMAGE_H
#define _ZPPIMAGE_H


#include <iostream>
#include <string>
#include <vector>
#include <tiff.h>
#include <tiffio.h>
#include <jpeglib.h>

/**
 * C++ class that wraps a libtiff TIFF image and provides access to
 * Zoomify-related methods.
 */
class ZppImage {

private:

  // Image path supplied
  std::string imagePath; 
  TIFF *tiff;

  // The image pixel dimensions
  std::vector<unsigned int> imageWidths, imageHeights;

  // The base tile pixel dimensions
  unsigned int tileSize; 
  
  // The number of tiles in all levels
  unsigned int tileNo;

  // The number of available resolutions in this image
  unsigned int numResolutions;
  
  // The number of channels for this image
  unsigned int channels;

  // The compression type
  unsigned int compressionType;

  // The compression type
  unsigned int colourType;

  // Opening the TIFF image
  void openImage() throw (std::string);
  
  // Closing the TIFF image
  void closeImage();
  
  // Converts the given tile to jpeg and returns the result
  unsigned char *convertTileToJpeg(tdata_t tile_buf, int w, int h, int q, unsigned long& length) throw (std::string);

  // Closing the TIFF image
  unsigned char *getRawJpegTile(unsigned int tile, unsigned long& length) throw (std::string);

public:

  // Constructer taking the image path as paramter
  ZppImage( const std::string& path);

  // Virtual Destructor
  virtual ~ZppImage() { closeImage(); };
  
  // Return the Zoomify image properties for the image
  std::string getImageProperties();
  
  // Return the Zoomify tile as a jpeg-compressed byte buffer
  unsigned char *getTile(unsigned int r, unsigned int x, unsigned int y, unsigned int q, unsigned long& length) throw (std::string);
  
  // Return the Zoomify tile as a jpeg-compressed byte buffer
  unsigned char *getTile(unsigned int q, const std::string& path, unsigned long& length) throw (std::string);

};

#endif


