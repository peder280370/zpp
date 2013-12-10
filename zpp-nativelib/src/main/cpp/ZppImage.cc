
#include <math.h>
#include <sstream>
#include "ZppImage.h"

using namespace std;
using std::string;

/**
 * Utlity method that computes the number of tiles for a image with the given dimension
 */
int computeTileNo(int tileSize, int w, int h) {
  return (int) ceil( (double)w/tileSize ) * (int) ceil( (double)h/tileSize );
}

/**
 * Constructor
 */
ZppImage::ZppImage ( const string& p )
{
  imagePath = p;
  tiff = NULL; 
  tileSize = 0; 
  tileNo = 0;
  numResolutions = 0;
  channels = 0;
  colourType = 0;
  openImage();
}

/**
 * Opens the TIFF image and caches the dimensions for the available
 * images in the pyramid tidd.
 */
void ZppImage::openImage() throw (string)
{
  // Try to open and allocate a buffer
  if( ( tiff = TIFFOpen( imagePath.c_str(), "r" ) ) == NULL ){
    throw string( "tiff open failed for: " + imagePath );
  }

  // Get the tile and image sizes for the full image
  unsigned int w, h, tileWidth, tileHeight;
  uint16 samplesperpixel, colour, compression;
  TIFFGetField( tiff, TIFFTAG_TILEWIDTH, &tileWidth );
  TIFFGetField( tiff, TIFFTAG_TILELENGTH, &tileHeight );
  TIFFGetField( tiff, TIFFTAG_IMAGEWIDTH, &w );
  TIFFGetField( tiff, TIFFTAG_IMAGELENGTH, &h );
  TIFFGetField( tiff, TIFFTAG_SAMPLESPERPIXEL, &samplesperpixel );
  TIFFGetField( tiff, TIFFTAG_PHOTOMETRIC, &colour );
  TIFFGetField( tiff, TIFFTAG_COMPRESSION, &compression );
 
  channels = (unsigned int) samplesperpixel;
  colourType = (unsigned int)colour;
  compressionType = (unsigned int)compression;
  
  // In Zoomify, tiles have identical width and height
  if (tileWidth != tileHeight) {
    ostringstream err;
    err << "Invalid Zoomify tile size " << tileWidth << "x" << tileHeight;
    throw err.str();
  }
  tileSize = tileWidth;

  // Check for the no. of resolutions in the pyramidal image
  tdir_t current_dir = TIFFCurrentDirectory( tiff );
  TIFFSetDirectory( tiff, 0 );

  // Store the list of image dimensions available
  numResolutions = 1;
  tileNo += computeTileNo(tileSize, w, h);
  imageWidths.push_back( w );
  imageHeights.push_back( h );

  // Zoomify does not accept arbitrary numbers of resolutions. The lowest
  // level must be the largest size that can fit within a single tile
  while ((w > tileWidth || h > tileHeight) && TIFFReadDirectory( tiff ) ) {
    TIFFGetField( tiff, TIFFTAG_IMAGEWIDTH, &w );
    TIFFGetField( tiff, TIFFTAG_IMAGELENGTH, &h );
    numResolutions++;
    tileNo += computeTileNo(tileSize, w, h);
    imageWidths.push_back( w );
    imageHeights.push_back( h );    
  }
  // Reset the TIFF directory
  TIFFSetDirectory( tiff, current_dir );

  // Insist on a tiled image
  if( (tileWidth == 0) && (tileHeight == 0) ) {
    throw string( "TIFF image is not tiled" );
  }
}

/**
 * Closes the TIFF image
 */
void ZppImage::closeImage()
{
  if( tiff != NULL ){
    TIFFClose( tiff );
    tiff = NULL;
  }
}

/**
 * Returns the Zoomify ImageProperties.xml description for the image.
 *
 * Format:
 * <IMAGE_PROPERTIES WIDTH="3000" HEIGHT="4000" NUMTILES="257" NUMIMAGES="1" VERSION="1.8" TILESIZE="256" />
 */
std::string ZppImage::getImageProperties() 
{
  ostringstream str;
  str << "<IMAGE_PROPERTIES"
      << " WIDTH=\"" << imageWidths[0] << "\""
      << " HEIGHT=\"" << imageHeights[0] << "\""
      << " NUMTILES=\"" << tileNo << "\""
      << " NUMIMAGES=\"1\""
      << " VERSION=\"1.8\""
      << " TILESIZE=\"" << tileSize << "\""  
      << " />\n";
  return str.str();
}

/**
 * Returns the requested tile as a byte buffer.
 * q is the jpeg quality used if the tile needs to be jpeg compressed.
 * path is a Zoomify-falvoured image path, such as "0-0-0.jpg".
 * length will be initialized with the data length.
 */
unsigned char *ZppImage::getTile(unsigned int q, const std::string& path, unsigned long& length) throw (string)
{
  std::string name = path;
  
  // First, remove directory if present, e.g. "TileGroup/0-0-0.jpg" -> "0-0-0.jpg"
  // Do this before extension removal in case directory has a period character.
  const size_t last_slash_idx = name.find_last_of("\\/");
  if (std::string::npos != last_slash_idx) {
    name.erase(0, last_slash_idx + 1);
  }

  // Next, remove extension if present, e.g. "0-0-0.jpg" -> "0-0-0"
  const size_t period_idx = name.rfind('.');
  if (std::string::npos != period_idx) {
    name.erase(period_idx);
  }

  // Get the tile coordinates. Zoomify requests are of the form "r-x-y.jpg"
  // where r is the resolution number and x and y are the tile coordinates
  std::istringstream ss(name);
  std::string token;
  if (!std::getline(ss, token, '-')) {
    throw string( "Invalid tile name: " + path );
  }
  unsigned int resolution = atoi( token.c_str() );
  if (!std::getline(ss, token, '-')) {
    throw string( "Invalid tile name: " + path );
  }
  unsigned int x = atoi( token.c_str() );
  if (!std::getline(ss, token, '-')) {
    throw string( "Invalid tile name: " + path );
  }
  unsigned int y = atoi( token.c_str() );
  
  // Do the deed
  return getTile(resolution, x, y, q, length);
}


/**
 * Returns the requested tile as a byte buffer.
 * r is the Zoomify tile-level (resolution) to fetch the tile from.
 * x and y are the tile coordinates.
 * q is the jpeg quality used if the tile needs to be jpeg compressed.
 * length will be initialized with the data length.
 */
unsigned char *ZppImage::getTile(unsigned int r, unsigned int x, unsigned int y, unsigned int q, unsigned long& length) throw (std::string)
{
  if (r > numResolutions - 1) {
    ostringstream error;
    error << "ZppImage :: Asked for non-existant resolution: " << r;
    throw error.str();
  }
  
  // In Zoomify, tile level 0 is the lowest resolution image. In TIFF the order is opposite.
  unsigned int dir = numResolutions - r - 1;
  unsigned int w = imageWidths[dir];
  unsigned int h = imageHeights[dir];
  unsigned int htno = (int)ceil( (double)w / tileSize );
  unsigned int vtno = (int)ceil( (double)h / tileSize );
  unsigned int tw = (x == htno - 1 && w % tileSize != 0) ?  w % tileSize : tileSize;
  unsigned int th = (y == vtno - 1 && h % tileSize != 0) ?  h % tileSize : tileSize;
  unsigned int tile = y * htno + x;
  

  // Change to the right directory for the resolution
  if( !TIFFSetDirectory( tiff, dir ) ) {
    throw string( "TIFFSetDirectory failed" );
  }

  // Check that a valid tile number was given
  if( tile >= TIFFNumberOfTiles( tiff ) ) {
    ostringstream tileEx;
    tileEx << "Asked for non-existant tile: " << tile;
    throw tileEx.str();
  } 

  // Check if we can export the tile directly.
  // This it true if the exported tile is already jpeg compressed
  // and the exported tile size is identical to the full tile size 
  if (compressionType == COMPRESSION_JPEG &&
      tw == tileSize && 
      th == tileSize) {
      return getRawJpegTile(tile, length);
  }
  
  // If the image is jpeg compressed and the colour is Yycbcr,
  // change to rgb
  int saveColourMode = -1;
  if (compressionType == COMPRESSION_JPEG && colourType == PHOTOMETRIC_YCBCR) {
    TIFFGetField(tiff, TIFFTAG_JPEGCOLORMODE, &saveColourMode );
    TIFFSetField(tiff, TIFFTAG_JPEGCOLORMODE, JPEGCOLORMODE_RGB );
  }
  
  // Create a buffer
  tdata_t tile_buf = NULL;
  if( ( tile_buf = _TIFFmalloc( TIFFTileSize( tiff ) ) ) == NULL ){
    throw string( "tiff malloc tile failed" );
  }
  
  try {
    // Decode and read the tile
    length = TIFFReadEncodedTile( tiff, (ttile_t) tile, tile_buf, (tsize_t) - 1 );
    if( length == -1 ) {
      throw string( "TIFFReadEncodedTile failed");
    }
    
    unsigned char *data = convertTileToJpeg(tile_buf, tw, th, q, length);
    _TIFFfree( tile_buf );
    
    // Restore the colour mode
    if (saveColourMode != -1) {
      TIFFSetField(tiff, TIFFTAG_JPEGCOLORMODE, saveColourMode );
    }
    
    return data;
  
  } catch (std::string &error) {
  
    _TIFFfree( tile_buf );
    
    // Restore the colour mode
    if (saveColourMode != -1) {
      TIFFSetField(tiff, TIFFTAG_JPEGCOLORMODE, saveColourMode );
    }
    
    throw error;
  }  
}



/**
 * Use libjpeg to compress the given part of a tiff tile.
 * tile_bud is the tiff tile to compress. Its dimension is tileSize x tileSize.
 * w and h is the width and height of the part of the tiff tile to compress as jpeg.
 * q is the jpeg quality (0-100).
 * length will be initialized with the data length.
 */
unsigned char *ZppImage::convertTileToJpeg(tdata_t tile_buf, int w, int h, int q, unsigned long& length) throw (string)
{
  // Initialize jpeg structures
  struct jpeg_compress_struct cinfo;
  struct jpeg_error_mgr jerr;
  cinfo.err = jpeg_std_error(&jerr);
  jpeg_create_compress(&cinfo);
  
  // Set up the memory buffer
  unsigned char *jpeg_data = NULL;
  unsigned long jpeg_data_size = 0;
  jpeg_mem_dest(&cinfo, &jpeg_data, &jpeg_data_size);

  // Set jpeg parameters
  cinfo.image_width = w;
  cinfo.image_height = h;
  cinfo.input_components = channels;
  cinfo.in_color_space = (channels == 3) ? JCS_RGB : JCS_GRAYSCALE;
  jpeg_set_defaults(&cinfo);
  jpeg_set_quality(&cinfo, q, TRUE);

  // Start compressor
  jpeg_start_compress(&cinfo, TRUE);

  // Write scan lines 
  unsigned char* data = (unsigned char*) tile_buf;
  int row_stride = tileSize * channels;   
  JSAMPROW *array = new JSAMPROW[h+1];
  for( int y=0; y < h; y++ ){
    array[y] = &data[ y * row_stride ];
  }
  jpeg_write_scanlines( &cinfo, array, h );
  delete[] array;
  
  // Finish up
  jpeg_finish_compress(&cinfo);
  jpeg_destroy_compress(&cinfo);
  
  // Return the result
  length = jpeg_data_size;
  return jpeg_data;
}



/**
 * Exports the given tile directly as jpeg
 * The proper pyramid level should have been set in advance using TIFFSetDirectory().
 * tile is the tile index at the current pyramid level.
 * length will be initialized with the data length.
 *
 * Check out: https://github.com/vadz/libtiff/blob/master/tools/tiff2pdf.c
 */
unsigned char *ZppImage::getRawJpegTile(unsigned int tile, unsigned long& length) throw (string)
{  
  unsigned char* jpt=NULL;
  tsize_t bufferoffset=0;
  unsigned char table_end[2];
  uint32 count = 0;
  //unsigned char* buffer= (unsigned char*) _TIFFmalloc(calculateRawJpegTileSize());
  unsigned char* buffer= (unsigned char*) _TIFFmalloc(TIFFTileSize( tiff ) );
  if(TIFFGetField(tiff, TIFFTAG_JPEGTABLES, &count, &jpt) != 0) {
    if (count > 0) {
            _TIFFmemcpy(buffer, jpt, count);
            bufferoffset += count - 2;
            table_end[0] = buffer[bufferoffset-2];
            table_end[1] = buffer[bufferoffset-1];
    }
    if (count > 0) {
            uint32 xuint32 = bufferoffset;
            bufferoffset += TIFFReadRawTile(
                    tiff, 
                    tile, 
                    (tdata_t) &(((unsigned char*)buffer)[bufferoffset-2]), 
                    -1);
                    buffer[xuint32-2]=table_end[0];
                    buffer[xuint32-1]=table_end[1];
    } else {
            bufferoffset += TIFFReadRawTile(
                    tiff, 
                    tile, 
                    (tdata_t) &(((unsigned char*)buffer)[bufferoffset]), 
                    -1);
    }
    
    // Success
    length = bufferoffset;
    return buffer;
    
  } else {
    // Failure
    length = 0;
    _TIFFfree(buffer);
    throw string( "Failed returning raw tiff tile" );
  }
}

