package dk.carolus.zpp.nativelib;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.nio.charset.Charset;

/**
 * Serves as a JNI wrapper for the ZppImage C++ class
 * which uses libtiff and libjpeg to fetch ImageProperties 
 * and tiles from a ptiff file according to the Zoomify protocol.
 *
 * @author peder
 */
public class ZppImage {

  /**
   * Native handle for the ZppImage C++ object that this class wraps
   */
	long jniHandle = -1;
	
  /**
   * Load the native interface to the ZppImage C++ class.
   */
	static {
		try {
      NativeUtils.loadLibraryFromJar("zpp-native");		
		} catch (Exception ex) {
		  ex.printStackTrace();
		}
	}
  
  /**
   * Constructor
   * @param path the path to the ptiff image
   */
  public ZppImage(String path) { 
    jniHandle = zppNewImage(path);
  }
  
  /**
   * Destroys the underlying C++ class
   */
  public void destroy() { 
    if (jniHandle != -1) {
      zppDestroyImage(jniHandle);
    }
    jniHandle = -1;
  }
  
  /**
   * Returns the image properties 
   */
  public String getImageProperties() throws Exception {
    String desc = zppFetchImageProperties(jniHandle);
    if (desc == null) {
      throw new Exception("Cound not fetch ImageProperties.xml");
    }
    return desc;
  }
  
  
  /**
   * Saves the image properties to a file
   */
  public void saveImageProperties(String fileName) throws Exception {
    String desc = getImageProperties();
    Files.write( 
      Paths.get(fileName), 
      desc.getBytes(Charset.defaultCharset()), 
      StandardOpenOption.CREATE);
  }

  /**
   * Returns the tile given by the given path
   */
  public byte[] getTile(int quality, String path) throws Exception {
    byte[] data = zppFetchTile(jniHandle, quality, path);
    if (data == null) {
      throw new Exception("Cound not fetch tile " + path);
    }
    return data;
  }

  /**
   * Saves the tile given by the given path to a file
   */
  public void saveTile(int quality, String path, String fileName) throws Exception {
    byte[] data = getTile(quality, path);
    Files.write( 
      Paths.get(fileName), 
      data, 
      StandardOpenOption.CREATE);
  }

  /**
   * JNI hooks
   */
	private native long zppNewImage(String filename);
	private native void zppDestroyImage(long handle);
  private native String zppFetchImageProperties(long handle);
  private native byte[] zppFetchTile(long handle, int quality, String path);


  /**
   * Test method to see that things works as intended.
   * <p>
   * Usage:<br>
   * <pre>java -classpath target/zpp-nativelib-0.1.0-SNAPSHOT.jar dk.carolus.zpp.nativelib.ZppImage image.tiff</pre>
   */
  public static void main(String[] args) throws Exception {
    long t0 = System.currentTimeMillis();
    ZppImage l = new ZppImage(args[0]);
    Path dir = Paths.get(args[0]).toAbsolutePath().getParent();
    Path imageProps = dir.resolve("ImageProperties.xml");
    Path tile000 = dir.resolve("1-0-0.jpg");
    for (int x = 0; x < 20000; x++) {
      l.saveImageProperties(imageProps.toString());
      l.saveTile(90, tile000.getFileName().toString(), tile000.toString());
      if (x % 1000 == 0) System.out.println("Progress: " + x + " " + (System.currentTimeMillis() - t0) + " ms");
    }
    System.out.println("Time: " + (System.currentTimeMillis() - t0) + " ms");
  }
}


