FROM node:24-alpine

LABEL project=openkcm_docs

# Install bash (optional but useful)
RUN apk add --no-cache bash

# Set working directory
WORKDIR /app

# Expose dev port
EXPOSE 5173

# Default command to start VitePress dev
ENTRYPOINT ["./hack/start-docs.sh"]
