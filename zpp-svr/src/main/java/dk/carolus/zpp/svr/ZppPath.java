package dk.carolus.zpp.svr;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Represents a path to a part (jpeg tile or image descriptor) in a Zoomify image.
 * <p>
 * The format of the path info should resemble these examples:
 * <ul>
 *   <li> The image properties file: <tt>/path/to/image/ImageProperties.xml</tt>
 *   <li> The image tiles: <tt>/path/to/image/TileGroup0/0-0-0.jpg</tt>
 * </ul>
 * <p>
 * Furthermore, the Zoomify image of the path can either be in the form of 
 * a <i>file bundle</i> or a <i>ptiff</i> image:
 * <ul>
 *   <li>Zoomify file bundle: The designated part is an actual file within the Zoomify file bundle.</li> 
 *   <li>ptiff: The designated part is a virtual file within a tiled pyramid tiff image.</li>
 * </ul>
 * 
 * @author peder
 */
public class ZppPath {
	
	/**
	 * The Zoomify image type, which may either be a Zoomify file bundle
	 * or a tile pyramid tiff.
	 */
	public enum ZoomifyType {
		FILE_BUNDLE,
		PTIFF
	}
	
	/**
	 * The part type denotes the type of the Zoomify image part requested, 
	 * i.e. either the image properties or an image tile.
	 */
	public enum PartType {
		IMAGE_PROPERTIES("(?i)(.*/[^/]+)/ImageProperties.xml$"),
		IMAGE_TILE("(?i)(.*/[^/]+)/TileGroup[\\d]+/([\\d]+-[\\d]+-[\\d]+.jpg)$");
		
		Pattern pattern;
		PartType(String p) {
			pattern = Pattern.compile(p);
		}
		public Pattern getPattern() {
			return pattern;
		}
	}
	
	ZoomifyType zoomifyType;
	PartType partType;
	String part;
	Path zoomifyImage;
	Path file;
	BasicFileAttributes attrs;
	
	/**
	 * Private constructor
	 */
	private ZppPath() {
	}
	
	/**
	 * Resolves the Zoomify path from the given path parameter.
	 * 
	 * @param repoRoot the root of the repository that holds the files.
	 * @param path the path to resolve
	 */
	public static ZppPath resolveZoomifyPath(Path repoRoot, String path) throws Exception {
		
		ZppPath zppPath = new ZppPath();
		
		// Parse the path
		Matcher m = PartType.IMAGE_PROPERTIES.getPattern().matcher(path);
		if (m.find()) {
			zppPath.partType 		= PartType.IMAGE_PROPERTIES;
			zppPath.part			= "ImageProperties.xml";
			zppPath.zoomifyImage	= resolveRepoPath(repoRoot, m.group(1));
		} else {
			m = PartType.IMAGE_TILE.getPattern().matcher(path);
			if (m.find()) {
				zppPath.partType 		= PartType.IMAGE_TILE;
				zppPath.part 			= m.group(2);
				zppPath.zoomifyImage	= resolveRepoPath(repoRoot, m.group(1));
			} else {
				throw new Exception(String.format("Path %s is not a valid Zoomify path", path));
			}
		}
		
		// Next, figure out if the image is a Zoomify file bundle or a ptiff
		BasicFileAttributes attrs = Files.readAttributes(zppPath.zoomifyImage, BasicFileAttributes.class);
		if (attrs.isDirectory()) {
			// Assume Zoomify file bundle
			zppPath.zoomifyType	= ZoomifyType.FILE_BUNDLE;
			zppPath.file 		= resolveRepoPath(repoRoot, path);
			zppPath.attrs 		= Files.readAttributes(zppPath.file, BasicFileAttributes.class);
		} else {
			// Assume ptiff
			zppPath.zoomifyType = ZoomifyType.PTIFF;
			zppPath.file 		= zppPath.zoomifyImage;
			zppPath.attrs 		= attrs;
		}
		
		// Lastly, add a security check to make sure that the file is actually inside the repository.
		// The client may have used ".." for parenting out of the repository.
		if (!zppPath.file.startsWith(repoRoot)) {
			throw new Exception(String.format("Path %s is outside the repository", path));
		}
		
		return zppPath;
	}

	/**
	 * Resolves the given path within the repository defined by the repository root
	 * @param repoRoot the repository root
	 * @param path the path to resolve
	 * @return the resolved and normalize path
	 */
	private static Path resolveRepoPath(Path repoRoot, String path) throws IOException {
		// Strip any initial "/" characters
		if (path.startsWith("/")) {
			path = path.substring(1);
		}
		return repoRoot.resolve(path).toRealPath();
	}
	
	/** GETTERS **/
	
	public ZoomifyType getZoomifyType() { 
		return zoomifyType; 
	}

	public Path getZoomifyImage() { 
		return zoomifyImage; 
	}

	public PartType getPartType() { 
		return partType; 
	}

	public String getPart() { 
		return part; 
	}

	public Path getFile() { 
		return file; 
	}

	public long getLastModifiedTime() { 
		return attrs.lastModifiedTime().toMillis(); 
	}

	public long getSize() { 
		return attrs.size(); 
	}
	
	public String getContentType() {
		return (partType == PartType.IMAGE_PROPERTIES) ? "text/xml" : "image/jpeg";
	}
}
