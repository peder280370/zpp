/*
 * zppwrap.c
 *
 * Library code to wrap the ZppImage library so that it may be called from Java.
 */

#include "dk_carolus_zpp_nativelib_ZppImage.h"
#include "ZppImage.h"

using namespace std;

/************************************************************************/

/*
 * Class:     dk_carolus_zpp_nativelib_ZppImage
 * Method:    zppNewImage
 * Signature: (Ljava/lang/String;)J
 */
JNIEXPORT jlong JNICALL Java_dk_carolus_zpp_nativelib_ZppImage_zppNewImage
  (JNIEnv *env, jobject self, jstring filename)
{
	const char *str = env->GetStringUTFChars(filename, 0);
  ZppImage *image = NULL;
  try {
    std::string name(str);
    image = new ZppImage(name);
    
  } catch (std::string error) {
  }
	env->ReleaseStringUTFChars(filename, str);
	
	return (image == NULL) ? -1L : (long)image;
}

/************************************************************************/

/*
 * Class:     dk_carolus_zpp_nativelib_ZppImage
 * Method:    zppDestroyImage
 * Signature: (J)V
 */
JNIEXPORT void JNICALL Java_dk_carolus_zpp_nativelib_ZppImage_zppDestroyImage
  (JNIEnv *env, jobject self, jlong handle)
{
  ZppImage *image = (ZppImage *) handle;
  delete image;
}

/************************************************************************/

/*
 * Class:     dk_carolus_zpp_nativelib_ZppImage
 * Method:    zppFetchImageProperties
 * Signature: (J)Ljava/lang/String;
 */
JNIEXPORT jstring JNICALL Java_dk_carolus_zpp_nativelib_ZppImage_zppFetchImageProperties
  (JNIEnv *env, jobject self, jlong handle)
{
  jstring result = NULL;
  try {
    ZppImage *image = (ZppImage *) handle;
    result = env->NewStringUTF(image->getImageProperties().c_str());
  } catch (std::string error) {
  }
  return result;
}


/************************************************************************/

/*
 * Class:     dk_carolus_zpp_nativelib_ZppImage
 * Method:    zppFetchTile
 * Signature: (JILjava/lang/String;)[B
 */
JNIEXPORT jbyteArray JNICALL Java_dk_carolus_zpp_nativelib_ZppImage_zppFetchTile
  (JNIEnv *env, jobject self, jlong handle, jint quality, jstring path)
{
  jbyteArray result = NULL;
  unsigned long length = 0;
	const char *p = env->GetStringUTFChars(path, 0);
  try {
    ZppImage *image = (ZppImage *) handle;
    std::string tilePath(p);
    unsigned char *data = image->getTile((unsigned int)quality, tilePath, length);
    result = env->NewByteArray(length);
    env->SetByteArrayRegion (result, 0, length, (jbyte *)data);
    free(data);
  } catch (std::string error) {
  }
	env->ReleaseStringUTFChars(path, p);
  return result;
}

