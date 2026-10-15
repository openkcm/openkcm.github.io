# CONTAINER_TOOL defines the container tool to be used for building images.
# Be aware that the target commands are only tested with Docker which is
# scaffolded by default. However, you might want to replace it to use other
# tools. (i.e. podman)
CONTAINER_TOOL ?= docker

# Docker image name for the VitePress based local development setup
IMAGE=openkcm/openkcm.github.io

# The anonymous volume on /app/node_modules keeps the container's Linux-native
# dependencies out of the host checkout, so a host `npm run docs:build` keeps working.
.PHONY: startdocs
startdocs: ## Start the VitePress dev server in Docker on http://localhost:5173.
	$(CONTAINER_TOOL) build -t $(IMAGE) -f docs/Dockerfile . --load
	$(CONTAINER_TOOL) run --rm -p 5173:5173 -v "$(CURDIR)":/app -v /app/node_modules $(IMAGE)

# Run the docs with Node on the host, without Docker.
# Dependencies are installed only when package-lock.json changes.
node_modules/.package-lock.json: package-lock.json
	npm ci

.PHONY: devdocs
devdocs: node_modules/.package-lock.json ## Start the VitePress dev server with Node on http://localhost:5173 (live reload).
	npm run docs:dev

.PHONY: builddocs
builddocs: node_modules/.package-lock.json ## Build the static site into docs/.vitepress/dist (fails on dead links).
	npm run docs:build

.PHONY: previewdocs
previewdocs: builddocs ## Build the site and serve the production build on http://localhost:4173.
	npm run docs:preview

.PHONY: cleandocs
cleandocs: ## Remove stopped docs containers (cleanup).
	$(CONTAINER_TOOL) container prune --force --filter "label=project=openkcm_docs"
