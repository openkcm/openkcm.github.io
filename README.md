# OpenKCM Landing Page and Central Documentation

[![REUSE status](https://api.reuse.software/badge/github.com/openkcm/openkcm.github.io)](https://api.reuse.software/info/github.com/openkcm/openkcm.github.io)
[![GitHub License](https://img.shields.io/static/v1?label=License&message=Apache-2.0&color=blue)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://makeapullrequest.com)

Welcome to the OpenKCM Documentation. This is the central source for all components of the OpenKCM.
This repository holds the multi-repository configuration for the [OpenKCM-based](https://github.com/openkcm) documentation.
Here you’ll find detailed guides, architecture overviews, usage instructions, and developer documentation.

## Running the Documentation Locally

To build and run the documentation container locally, run:

```
make startdocs
```

Then open your browser and navigate to http://localhost:5173/ to view the documentation site.

## Cleaning Up

To remove unused Docker containers for this project, run:
```
make cleandocs
```

## Licensing

Copyright 2025 SAP SE or an SAP affiliate company and OpenKCM contributors. Please see our [LICENSE](LICENSE) for
copyright and license information. Detailed information including third-party components and their licensing/copyright
information is available [via the REUSE tool](https://api.reuse.software/info/github.com/openkcmF/openkcm.github.io).
