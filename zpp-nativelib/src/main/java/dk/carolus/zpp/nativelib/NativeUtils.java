package dk.carolus.zpp.nativelib;


import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
 
/**
 * Loads the requested native library from the Jar file.
 * <p>
 * The name used to load the library is the "simple name" of the library. 
 * So, if you e.g. use "mylib" on a Mac, the actual library "libmylib.dylib" 
 * will be loaded.
 * <p>
 *
 * @author Peder
 */
public class NativeUtils {
    
    enum OSType { MAC_OS_X, WINDOWS, LINUX };
    private static OSType os;
    
    static {
      String osName = System.getProperty("os.name").toLowerCase();
      if (osName.startsWith("mac os x")) {
        os = OSType.MAC_OS_X;
      } else if (osName.startsWith("linux")) {
        os = OSType.LINUX;
      } else {
        os = OSType.WINDOWS;
      }
    }
 
    /**
     * Private constructor
     */
    private NativeUtils() {
    }
  
    /**
     * Returns the OS-specific library prefix
     * @return the prefix to use for the library in the current OS
     */
    private static String getLibraryPrefix() {
      switch (os) {
        case MAC_OS_X: return "lib";
        case LINUX:    return "lib";
        default:       return "";
      }
    }
    
    /**
     * Returns the OS-specific library suffix
     * @return the suffix to use for the library in the current OS
     */
    private static String getLibrarySuffix() {
      switch (os) {
        case MAC_OS_X: return ".dylib";
        case LINUX:    return ".so";
        default:       return ".dll";
      }
    }
    
    /**
     * Return the calling class
     * @return the calling class
     */
    private static Class getCallingClass() {
      Class[] classContext = new SecurityManager() {
        @Override public Class[] getClassContext() {
          return super.getClassContext();
        }}.getClassContext();
      return classContext[3];
    }
    
    /**
     * Loads the library from jar archive
     * <p>
     * The name is the "simple name" of the library. So, if you pass "mylib" on a Mac,
     * the actual library "libmylib.dylib" will be loaded.
     * <p>
     * The library is loaded from the same package as the calling class.
     *
     * @param libraryName the name of the library to load
     */
    public static void loadLibraryFromJar(String libraryName) throws IOException {
      Class clazz = getCallingClass();
      String packagePath = "/" + clazz.getPackage().getName().replaceAll("\\.", "/");
      loadLibraryFromJar(packagePath, libraryName);
    }
    
    /**
     * Loads the library from jar archive.
     * <p>
     * The name is the "simple name" of the library. So, if you pass "mylib" on a Mac,
     * the actual library "libmylib.dylib" will be loaded.
     * <p>
     * The library is loaded from the package given by the packagePath parameter.
     *
     * @param packagePath the package path of the library
     * @param libraryName the name of the library to load
     */
    public static void loadLibraryFromJar(String packagePath, String libraryName) throws IOException {
      
      // Determine the full OS-specific library name
      String library = packagePath + "/" + getLibraryPrefix() + libraryName + getLibrarySuffix();
 
      // Prepare temporary file
      Path temp = Files.createTempFile(getLibraryPrefix(), getLibrarySuffix());
      
      // Copy the library from the jar to the temp file
      try (InputStream is = NativeUtils.class.getResourceAsStream(library)) {
        Files.copy(is, temp, StandardCopyOption.REPLACE_EXISTING);
      }
      temp.toFile().deleteOnExit();
 
      // Finally, load the library
      System.load(temp.toAbsolutePath().toString());
    }
}