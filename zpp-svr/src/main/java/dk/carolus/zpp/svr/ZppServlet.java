package dk.carolus.zpp.svr;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Calendar;
import java.util.Date;
import java.util.logging.Level;
import java.util.logging.Logger;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import dk.carolus.zpp.nativelib.ZppImage;
import dk.carolus.zpp.svr.ZppPath.PartType;

/**
 * Servlets that fetches Zoomify image parts defined by the request path info.
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
    
	/**
	 * Main GET method
	 * @param request servlet request
	 * @param response servlet response
	 * @throws IOException 
	 */
	@Override
	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException, ServletException {
		
		/**
		 * The path info will point out the Zoomify path to fetch.
		 * Examples:
		 *   /path/to/image.tif/ImageProperties.xml
		 *   /path/to/image.tif/TileGroup0/0-0-0.jpg
		 */
		String pathInfo = request.getPathInfo();
		Path repoRoot = Repositories.getRepoRoot();
		try {
			// Extract the desired image file and Zoomify path
			ZppPath zppPath = ZppPath.resolveZoomifyPath(
					repoRoot,
					pathInfo);
			
			// Check whether to use the cached version or not
			// Also, sets the caching response headers.
			if (checkUseCachedVersion(request, response, zppPath)) {
				return;
			}
			
			// Send the Zoomify part back in the response 
			response.setContentType(zppPath.getContentType());
			if (zppPath.getZoomifyType() == ZppPath.ZoomifyType.PTIFF) {
				sendPTiffResponse(zppPath, response);
			} else {
				sendFileBundleResponse(zppPath, response);
			}
			
			response.flushBuffer();
			
		} catch (Exception ex) {
			log.log(Level.SEVERE, "Error serving the requested file: " + ex);
			response.sendError(
					HttpServletResponse.SC_NOT_FOUND, 
					ex.toString());
		}
	}

	
	/**
	 * Checks the various request headers to see if the cached response should be used.
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
	boolean checkUseCachedVersion(HttpServletRequest request, HttpServletResponse response, ZppPath zppPath) {
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
	 * Send the requested Zoomify image part back to the response.
	 * <p>
	 * The part is extracted from a tiled pyramid tiff.
	 * 
	 * @param repository the current repository
	 * @param zppPath the Zoomify image part
	 * @param response the HTTP response
	 */
	void sendPTiffResponse(ZppPath zppPath, HttpServletResponse response) throws Exception {
		
		long t0 = System.currentTimeMillis();
				
		ZppImage image = null;
		try {
			image = new ZppImage(zppPath.getFile().toString());
			
			if (zppPath.getPartType() == PartType.IMAGE_TILE) {
				byte[] data = image.getTile(85, zppPath.getPart());
				response.setContentLength(data.length); // Pre-requisite for keep-alive
				response.getOutputStream().write(data);
			} else {
				String data = image.getImageProperties();
				response.getWriter().write(data);
			}
			
			log.log(Level.INFO, 
					String.format("Generated file %s -> %S in %d ms", 
							zppPath.getFile(),
							zppPath.getPart(),
							System.currentTimeMillis() - t0));
			
		} finally {
			if (image != null) {
				image.destroy();
			}
		}
	}

	/**
	 * Send the requested Zoomify image part back to the response
	 * <p>
	 * The part is assumed to be a file within a Zoomify file bundle.
	 * 
	 * @param repository the current repository
	 * @param zppPath the Zoomify image part
	 * @param response the HTTP response
	 */
	void sendFileBundleResponse(ZppPath zppPath, HttpServletResponse response) throws Exception {
		
		long t0 = System.currentTimeMillis();
		
		response.setContentLength((int)zppPath.getSize()); // Pre-requisite for keep-alive
		Files.copy(zppPath.getFile(), response.getOutputStream());
		
		log.log(Level.INFO, 
				String.format("Generated file %s in %d ms", 
						zppPath.getFile(), 
						System.currentTimeMillis() - t0));
	}

}

