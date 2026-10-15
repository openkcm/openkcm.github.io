# OpenKCM Landing Page and Central Documentation

[![REUSE status](https://api.reuse.software/badge/github.com/openkcm/openkcm.github.io)](https://api.reuse.software/info/github.com/openkcm/openkcm.github.io)
[![GitHub License](https://img.shields.io/static/v1?label=License&message=Apache-2.0&color=blue)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://makeapullrequest.com)

Welcome to the OpenKCM Documentation. This is the central source for all components of the OpenKCM.
This repository holds the multi-repository configuration for the [OpenKCM-based](https://github.com/openkcm) documentation.
Here you’ll find detailed guides, architecture overviews, usage instructions, and developer documentation.

## Running the Documentation Locally

With Node.js installed, start the development server with live reload:

```
make devdocs
```

Without Node.js, run the same development server in a Docker container:

```
make startdocs
```

Either way, open http://localhost:5173/ in your browser. Stop the server with Ctrl+C.

To check the production build before you open a pull request, run:

| Command | What it does |
| --- | --- |
| `make builddocs` | Builds the static site into `docs/.vitepress/dist` and fails on dead links |
| `make previewdocs` | Builds the site and serves the result on http://localhost:4173/ |

The Node.js targets install the dependencies with `npm ci` when `package-lock.json` has changed.

## Cleaning Up

To remove unused Docker containers for this project, run:
```
make cleandocs
```

## Code of Conduct

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone. By participating in this project, you agree to abide by its [Code of Conduct](https://github.com/openkcm/.github/blob/main/CODE_OF_CONDUCT.md) at all times.

## Licensing

Copyright OpenKCM contributors. Please see our [LICENSE](LICENSE) for copyright and license information. Detailed information including third-party components and their licensing/copyright information is available [via the REUSE tool](https://api.reuse.software/info/github.com/openkcm/openkcm.github.io).

---

<p align="center">
  <a href="https://apeirora.eu/content/projects/">
    <img alt="BMWK-EU funding logo" src="https://apeirora.eu/assets/img/BMWK-EU.png" width="300"/>
  </a>
</p>

<p align="center">
  OpenKCM is part of <a href="https://apeirora.eu/content/projects/">ApeiroRA</a>, an EU Important Project of Common European Interest (IPCEI-CIS).
</p>

<p align="center">
  Copyright Linux Foundation Europe. For web site terms of use, trademark policy and other project policies please see <a href="https://linuxfoundation.eu/en/policies">https://linuxfoundation.eu/en/policies</a>.
</p>