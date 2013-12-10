#include <vips/vips.h>
#include <vips/vipscpp.h>
#include <iostream>
#include <math.h>

using std::string;
using namespace vips;

#ifndef M_PI
const double M_PI = 3.14159265358979323846;
#endif

static const char *kOrientationTag  = "exif-ifd0-Orientation";
static const char *kBilinear        = "bilinear";

/**
 * Print usage of this program
 */
int Usage(const int returnCode) {
    std::cout << "usage: zpp_vips input output [options]\n"
              << "options is a combination of:\n"
              << "  -rotate d:      Rotate the image with d degrees, changing the dimensions to fit\n"
              << "  -rotatep d:     Rotate the image with d degrees, preserving the dimensions\n"
              << "  -resize w h:    Resize the image proportionally to w*h. Use 0 for a computed value\n"
              << "  -crop x y w h:  Crop the image to the given bounding box\n"
              << "  -sharpen:       Sharpens the image\n"
              << "  -zoomify t:     Create Zoomify tiles of the given size\n";
    return returnCode;
}


/**
 * Checks if the given string has the given prefix
 */
bool prefix(const char *pre, const char *str)
{
    return strncmp(pre, str, strlen(pre)) == 0;
}

/**
 * Looks for the orientation of the image by checking the
 * "exif-ifd0-Orientation" EXIF flag.
 * Maps the orientation to degrees
 */
int GetAutoOrientation(VImage &im) {
    int orientation = 0;
    const char *exifOrientation = NULL;
    try {
        exifOrientation = im.meta_get_string(kOrientationTag);
        if (prefix("3", exifOrientation))
            orientation = 180;
        else if (prefix("6", exifOrientation))
            orientation = 90;
        else if (prefix("8", exifOrientation))
            orientation = 270;
    } catch (VError &ignore) {
    }
    return orientation;
}

/**
 * Resets the EXIF orientation flag to 0 degrees
 */
void ResetOrientation(VImage &im) {
    im.meta_set(kOrientationTag, "1 (Top-left, Short, 1 components, 2 bytes)");
}

/**
 * Uncomment to log operations performed on the image
 */
void Log(const string& txt) {
    //std::cout << txt << std::endl;
}

/**
 * Prints out vital information about the given image, 
 * i.e. file path, size and orientation
 */
void LogImageSpec(VImage &img, const string& prefix, const string& path) {
    std::cout << prefix << "[\"" << path << "\"] "
    << img.Xsize() << "x" << img.Ysize() << " "
    << GetAutoOrientation(img) 
    << std::endl;
}

/**
 * Given a target width and height, this function compute the best width and height
 * for proportional resizing.
 * Addiitonally, computes the shrink factor and residual used for the actual resizing.
 */
void AdjustToProportionalResizing(VImage &im, int &w, int &h, int &shrink, double &residual) {
    int w0 = im.Xsize(), h0 = im.Ysize();
    double scale = 1.0;
    
    // Adjust the scaled width and height to be proportional
    if (w == 0 && h == 0) {
        w = w0;
        h = h0;
    
    } else if (h == 0) {
        scale = (double)w / (double)w0;
        h = (int)((double)h0 * scale + 0.5);
        
    } else if (w == 0) {
        scale = (double)h / (double)h0;
        w = (int)((double)w0 * scale + 0.5);
        
    } else {
        double scaleW = (double)w / (double)w0;
        double scaleH = (double)h / (double)h0;
        scale = std::min(scaleW, scaleH);
        h = (int)((double)h0 * scale + 0.5);
        w = (int)((double)w0 * scale + 0.5);
    }
    
    // Compute shrink and residual parts
    double factor = 1.0 / scale;
    shrink = (scale < 1.0) ? floor(factor) : 1;
    residual = (double)shrink / factor;
}

/**
 * Main method of the program.
 * Parses the command line arguments and performs the operations specified.
 */
int main (int argc, char **argv)
{
    if (argc < 2) {
        return Usage(1);
    }
    
    try {
        VImage img (argv[1]);
        int orientation = GetAutoOrientation(img);
        
        // Always print resolution and orientation
        LogImageSpec(img, "source", argv[1]);
        
        // If no other arguments are specified, we're done
        if (argc == 2) {
            return 0;
        }
        
        // Handle auto roration
        bool changed = false;
        if (orientation == 90) {
            Log("Auto-rotating");
            img = img.rot90();
            ResetOrientation(img);
            changed = true;
        } else if (orientation == 180) {
            Log("Auto-rotating");
            img = img.rot180();
            ResetOrientation(img);
            changed = true;
        } else if (orientation == 270) {
            Log("Auto-rotating");
            img = img.rot270();
            ResetOrientation(img);
            changed = true;
        }
        
        // Keep track of if we need to save as a normal file or zoomify tiles
        bool saveAsZoomify = false;
        int zoomifyTileSize = 256;
        
        // Handle the remaining parameters
        for (int c = 3; c < argc; c++) {
            
            /******* Rotation *********/
            if (strcmp(argv[c], "-rotate") == 0) {
                Log("Rotating");
                if (++c == argc) {
                    return Usage(1);
                }
                orientation = strtol(argv[c], NULL, 10);
                if (orientation == 90) {
                    img = img.rot90();
                    changed = true;
                } else if (orientation == 180) {
                    img = img.rot180();
                    changed = true;
                } else if (orientation == 270) {
                    img = img.rot270();
                    changed = true;
                } else if (orientation != 0) {
                    double a = cos((double)orientation * M_PI / 180.0);
                    double b = sin((double)orientation * M_PI / 180.0);
                    double c = -b;
                    double d = a;
                    img = img.affinei_all((char *)kBilinear, a, b, c, d, 0.0, 0.0);
                    changed = true;
                }
            }
            
            /******* Rotation *********/
            else if (strcmp(argv[c], "-rotatep") == 0) {
                Log("Rotating (preserve bounds)");
                if (++c == argc) {
                    return Usage(1);
                }
                orientation = strtol(argv[c], NULL, 10);
                if (orientation != 0) {
                    double a = cos((double)orientation * M_PI / 180.0);
                    double b = sin((double)orientation * M_PI / 180.0);
                    double c = -b;
                    double d = a;
                    int dx = ((double)img.Xsize() - ((double)img.Xsize() * a + (double)img.Ysize() * b) + 0.5) / 2;
                    int dy = ((double)img.Ysize() - ((double)img.Xsize() * c + (double)img.Ysize() * d) + 0.5) / 2;
                    img = img.affinei((char *)kBilinear, a, b, c, d, 0.0, 0.0, -dx, -dy, img.Xsize(), img.Ysize());
                    changed = true;
                }
            }
            
            /******* Resizing *********/
            else if (strcmp(argv[c], "-resize") == 0) {
                Log("Resizing");
                if (++c == argc) {
                    return Usage(1);
                }
                int w = strtol(argv[c], NULL, 10);
                if (++c == argc) {
                    return Usage(1);
                }
                int h = strtol(argv[c], NULL, 10);
                int shrink;
                double residual;
                AdjustToProportionalResizing(img, w, h, shrink, residual);
                if (w != img.Xsize() && h != img.Ysize()) {
                    //img = img.resize_linear(w, h);
                    // First, shrink an integral amount with im_shrink.  Then, do the leftover
                    // part with im_affinei using bilinear interpolation.
                    if (shrink != 1) {
                        img = img.shrink(shrink, shrink);
                    }
                    img = img.affinei_all((char *)kBilinear, residual, 0, 0, residual, 0, 0);
                    changed = true;
                }
            }
            
            /******* Sharpen *********/
            else if (strcmp(argv[c], "-sharpen") == 0) {
                Log("Sharpening");
                // make a 3x3 sharpen mask
                VIMask sharp (3, 3, 8, 0,
                              -1, -1, -1,
                              -1, 16, -1,
                              -1, -1, -1);
                img = img.conv (sharp);
                changed = true;
            }
            
            /******* Cropping *********/
            else if (strcmp(argv[c], "-crop") == 0) {
                Log("Cropping");
                if (++c == argc) {
                    return Usage(1);
                }
                int x = strtol(argv[c], NULL, 10);
                if (++c == argc) {
                    return Usage(1);
                }
                int y = strtol(argv[c], NULL, 10);
                if (++c == argc) {
                    return Usage(1);
                }
                int w = strtol(argv[c], NULL, 10);
                if (++c == argc) {
                    return Usage(1);
                }
                int h = strtol(argv[c], NULL, 10);
                
                // Sadly, VIPS fails if the area is outside the image bounds
                x = std::max(0, std::min(x, img.Xsize() - 1));
                y = std::max(0, std::min(y, img.Ysize() - 1));
                w = std::max(0, std::min(w, img.Xsize() - x));
                h = std::max(0, std::min(h, img.Ysize() - y));
                img = img.extract_area(x, y, w, h);
                //img = img.affinei((char *)kBilinear, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, x, y, w, h);
                changed = true;
            }
            
            /******* Zoomify *********/
            else if (strcmp(argv[c], "-zoomify") == 0) {
                if (++c == argc) {
                    return Usage(1);
                }
                saveAsZoomify = true;
                zoomifyTileSize = strtol(argv[c], NULL, 10);
           }
            
            /******* Unknown parameter *********/
            else {
                return Usage(1);
            }
        }
        
        // Save the result - either as zoomify tiles or as a file
        if (saveAsZoomify) {
            Log("Saving (zoomify format)");
            LogImageSpec(img, "result", argv[2]);
            vips_dzsave(img.image(),
                    argv[2],
                    "layout", VIPS_FOREIGN_DZ_LAYOUT_ZOOMIFY,
                    "tile_size", zoomifyTileSize,
                    NULL);
        } else {
            Log("Saving");
            LogImageSpec(img, "result", argv[2]);
            img.write (argv[2]);
        }
        
    } catch (VError &e) {
        e.perror (argv[0]);
        return (1);
    }
    
    return (0);
}
