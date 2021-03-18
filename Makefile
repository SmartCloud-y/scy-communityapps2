PLUGIN_VERSION=21.2.0.0
PLUGIN_PACKAGE_ID=com.cloud_y.apps20_${PLUGIN_VERSION}

DIST_FOLDER=dist

WEBRESOURCES_PATH="../webresources"

build: communityApp20-build-jar 

communityApp20-deploy-files:
	-rm ${WEBRESOURCES_PATH}/${PLUGIN_PACKAGE_ID}.jar
	-rm -rf ${WEBRESOURCES_PATH}/${PLUGIN_PACKAGE_ID}
	mkdir ${WEBRESOURCES_PATH}/${PLUGIN_PACKAGE_ID}
	cp -r plugin/* ${WEBRESOURCES_PATH}/${PLUGIN_PACKAGE_ID}

communityApp20-build-jar: clean
	mkdir ${DIST_FOLDER}
	cd plugin && jar -cvfm ../${DIST_FOLDER}/${PLUGIN_PACKAGE_ID}.jar META-INF/MANIFEST.MF .
	

communityApp20-deploy-jar: communityApp20-build-jar
	-rm -rf ${WEBRESOURCES_PATH}/${PLUGIN_PACKAGE_ID}
	cp ${DIST_FOLDER}/${PLUGIN_PACKAGE_ID}.jar ${WEBRESOURCES_PATH}

clean:
	-rm -rf ${DIST_FOLDER}