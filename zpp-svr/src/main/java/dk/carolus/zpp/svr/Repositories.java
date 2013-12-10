package dk.carolus.zpp.svr;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.logging.Logger;

/**
 * Used to manage the repositories.
 * <p>
 * For the time being, the implementation is very crude and just returns
 * the repository root defined by the "repo.root" system property.
 * 
 * @author peder
 */
public class Repositories {
	
	static final String REPO_ROOT_PATH = System.getProperty("repo.root");
	static final Logger log = Logger.getLogger(Repositories.class.getName());
    
	static Path repoRoot;
	
	static {
		String repoRootPath = REPO_ROOT_PATH;
		if (repoRootPath == null) {
			repoRootPath = "../testrepo";
		}
		repoRoot = Paths.get(repoRootPath).toAbsolutePath().normalize();
		if (!Files.exists(repoRoot) || !Files.isDirectory(repoRoot)) {
			throw new RuntimeException("Ivalid repository root: " + repoRootPath);
		}
		log.info("Using repository root: " + repoRoot);
	}

	/**
	 * Returns the repository root to use
	 * @return the repository root
	 */
	public static Path getRepoRoot() {
		return repoRoot;
	}
}
