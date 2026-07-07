# syntax=docker/dockerfile:1

# Parse Server + the S3 files adapter.
#
# The official parseplatform/parse-server image only ships the default GridFS
# (MongoDB) file store, so we install the S3 adapter here for object storage.
FROM parseplatform/parse-server:9.9.0

USER root
RUN npm install --omit=dev --no-audit --no-fund --save @parse/s3-files-adapter@5.3.1

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
