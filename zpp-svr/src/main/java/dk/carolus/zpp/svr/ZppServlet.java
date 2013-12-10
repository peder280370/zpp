package dk.carolus.zpp.svr;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Calendar;
import java.util.Date;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.logging.Level;
import java.util.logging.Logger;

import javax.servlet.AsyncContext;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import net.sf.ehcache.Cache;
import net.sf.ehcache.CacheManager;
import net.sf.ehcache.Element;

import dk.carolus.zpp.nativelib.ZppImage;
import dk.carolus.zpp.svr.ZppPath.PartType;

/**
 * Servlets that fetches Zoomify image parts defined by the request path info.<br/>
 * The requests are processed asynchronously via a thread pool, to constrain the 
 * maximal load on the system.
 * <p>
 * The format of the path info should resemble these examples:
 * <ul>
 *   <li> The image properties file: <tt>/path/to/image.tif/ImageProperties.xml</tt>
 *   <li> The image tiles: <tt>/path/to/image.tif/TileGroup0/0-0-0.jpg</tt>
 * </ul>
 * <p>
 * The underlying Zoomify image may either be in the form of a Zoomify file bundle
 * or a tiled pryramid tiff. 
 * <p>
 * Important: If you run this from, say, Eclipse, be sure to add 
 * <code>-Drepo.root=/path/to/zpp/testrepo</code> to the runtime arguments.
 * 
 * @author peder
 */
@WebServlet(value="/zpprepo/*", name="Zpp Servlet", asyncSupported=true)
public class ZppServlet extends HttpServlet {

	static final long TTL_SECONDS = 24 * 60 * 60; // One day
		
	static final Logger log = Logger.getLogger(ZppServlet.class.getName());
	
	// Process pool
	static final int PROCESS_POOL_SIZE = 50;
	private ExecutorService processPool;
	
	// Cache
	static final String IMAGE_CACHE_NAME = "ImageCache";
	private Cache imageCache;
    
	/**
	 * Called when the servlet is initialized
	 */
	@Override 
	public void init() {
		processPool = Executors.newFixedThreadPool(PROCESS_POOL_SIZE);
		log.info("Created processor pool with " + PROCESS_POOL_SIZE + " threads");
		
		imageCache = CacheManager.getInstance().getCache("ImageCache");
		log.info("Instantiated image cache " + imageCache.getCacheConfiguration());
	}

	/**
	 * Called when the servlet is destroyed
	 */
	@Override 
	public void destroy() {
		processPool.shutdown();
		CacheManager.getInstance().shutdown();
	}

	/**
	 * Main GET method
	 * @param request servlet request
	 * @param response servlet response
	 * @throws IOException 
	 */
	@Override
	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException, ServletException {
		// Execute the request asynchronously
		processPool.execute(new AsyncRequestProcessor(request.startAsync(), request.getPathInfo()));
	}
	
	/**
	 * Asynchronous implementation of the GET method
	 * @param request servlet request
	 * @param response servlet response
	 * @throws IOException 
	 */
	protected void asyncDoGet(HttpServletRequest request, HttpServletResponse response, String pathInfo) throws IOException, ServletException {
		
		long t0 = System.currentTimeMillis();
		
		/**
		 * The path info will point out the Zoomify path to fetch.
		 * Examples:
		 *   /path/to/image.tif/ImageProperties.xml
		 *   /path/to/image.tif/TileGroup0/0-0-0.jpg
		 */
		Path repoRoot = Repositories.getRepoRoot();
		try {
			// Extract the desired image file and Zoomify path
			ZppPath zppPath = ZppPath.resolveZoomifyPath(
					repoRoot,
					pathInfo);
			
			// Check whether to use the cached version or not
			// Also, sets the caching response headers.
			if (checkUseClientCachedVersion(request, response, zppPath)) {
				return;
			}
			
			// Check if the part is cached in the imageCache
			String returnedFileType = "cached data";
			byte[] data = getServerCachedVersion(zppPath);
			
			// If not cached, fetch it
			if (data == null) {
				// Send the Zoomify part back in the response 
				response.setContentType(zppPath.getContentType());
				if (zppPath.getZoomifyType() == ZppPath.ZoomifyType.PTIFF) {
					returnedFileType = "ptiff data";
					data = readPTiffPart(zppPath);
				} else {
					returnedFileType = "Zoomify file bundle data";
					data = readFileBundleResponse(zppPath);
				}
				cacheOnServer(zppPath, data);
			}
			
			// Update the response
			response.setContentLength(data.length); // Pre-requisite for keep-alive
			response.setContentType(zppPath.getContentType());
			response.getOutputStream().write(data);
			response.flushBuffer();
			
			log.log(Level.INFO, 
					String.format("Returning %s: %s -> %S in %d ms",
							returnedFileType, 
							zppPath.getFile(),
							zppPath.getPart(),
							System.currentTimeMillis() - t0));
			
		} catch (Exception ex) {
			log.log(Level.SEVERE, "Error serving the requested file: " + ex);
			response.sendError(
					HttpServletResponse.SC_NOT_FOUND, 
					ex.toString());
		}
	}

	
	/**
	 * Checks the various request headers to see if the client browser's 
	 * cached response should be used.<br/>
	 * Sets the cache header according to the parameters.
	 * <p>
	 * A combination of last modification time and file length
	 * is considered good enough for a weak eTag identifier.
	 * 
	 * @param request servlet request
	 * @param response servlet response
	 * @param zppPath the Zoomify part to check caching for
	 * @return if the cached version was used
	 */
	boolean checkUseClientCachedVersion(HttpServletRequest request, HttpServletResponse response, ZppPath zppPath) {
		// Set response headers 
		Date now = Calendar.getInstance().getTime();
		response.setDateHeader("Last-Modified", zppPath.getLastModifiedTime());
		response.setDateHeader("Expires", (now.getTime() + TTL_SECONDS * 1000L));
		response.setHeader("Cache-Control","max-age=" + TTL_SECONDS);
		
		long ifLastModified = request.getDateHeader("If-Modified-Since");
		if (ifLastModified != -1 && ifLastModified < zppPath.getLastModifiedTime()) {
			response.setStatus(HttpServletResponse.SC_NOT_MODIFIED);
			response.setContentLength(0);
			return true;
		}
		
		// Check if there is an eTag match
		String weTag = "W/\"" + zppPath.getLastModifiedTime() + "_" + zppPath.getSize() + "\""; // Weak eTag
		response.setHeader("ETag", weTag);
		String ifNoneMatch = request.getHeader("If-None-Match");
		if (weTag.equals(ifNoneMatch)) {
			response.setStatus(HttpServletResponse.SC_NOT_MODIFIED);
			response.setContentLength(0);
			return true;
		}
		
		// Do not use the cached version
		return false;
	}	
	
	/**
	 * Checks if the given Zoomify image part is cached in the {@code imageCache}.
	 * Returns the cached version, or null, if it is not cached.
	 * 
	 * @param zppPath the Zoomify image part
	 * @return the cached byte data
	 */
	byte[] getServerCachedVersion(ZppPath zppPath) {
		Element e = imageCache.get(zppPath.getCacheKey());
		return (e == null) ? null : (byte[])e.getObjectValue();
	}
	
	/**
	 * Caches the given data in the {@code imageCache}.
	 * 
	 * @param zppPath the Zoomify image part
	 * @param data the byte data to cache
	 */
	void cacheOnServer(ZppPath zppPath, byte[] data) {
		imageCache.put(new Element(zppPath.getCacheKey(), data));
	}
	
	/**
	 * Reads and returns the requested Zoomify image part.
	 * <p>
	 * The part is extracted from a tiled pyramid tiff.
	 * 
	 * @param zppPath the Zoomify image part
	 * @return the byte data
	 */
	byte[] readPTiffPart(ZppPath zppPath) throws Exception {
		
		ZppImage image 	= null;		
		try {
			image = new ZppImage(zppPath.getFile().toString());
			
			if (zppPath.getPartType() == PartType.IMAGE_TILE) {
				return image.getTile(85, zppPath.getPart());
			} else {
				return image.getImageProperties().getBytes("UTF-8");
			}
			
		} finally {
			if (image != null) {
				image.destroy();
			}
		}
	}

	/**
	 * Reads and returns the requested Zoomify image part.
	 * <p>
	 * The part is assumed to be a file within a Zoomify file bundle.
	 * 
	 * @param zppPath the Zoomify image part
	 * @return the byte data
	 */
	byte[] readFileBundleResponse(ZppPath zppPath) throws Exception {		
		return Files.readAllBytes(zppPath.getFile());
	}

	
	/**
	 * Helper class that instigates the asynchronous processing
	 * of the request.
	 */
	class AsyncRequestProcessor implements Runnable {
		
		AsyncContext asyncContext;
		String pathInfo;
		
		/**
		 * Constructor
		 * @param asyncContext
		 */
		AsyncRequestProcessor(AsyncContext asyncContext, String pathInfo) {
			this.asyncContext = asyncContext;
			this.pathInfo = pathInfo;
		}
		
		/**
		 * Called when the request is ready to be processed
		 */
		@Override
		public void run() {
			try {
				asyncDoGet(
						(HttpServletRequest)asyncContext.getRequest(), 
						(HttpServletResponse)asyncContext.getResponse(),
						pathInfo);
				
			} catch (IOException | ServletException e) {
				// Already handled
			} finally {
				asyncContext.complete();
			}
		}
	}
}

