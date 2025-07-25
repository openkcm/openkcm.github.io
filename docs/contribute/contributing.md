# Contributing to OpenKCM Documentation

We welcome contributions from the community! Follow these guidelines to help us maintain high-quality, consistent documentation.

## How to Contribute
1. Fork the repository and create a new branch.
2. Make your changes following the [Style Guide](style-guide.md).
3. Submit a pull request with a clear description of your changes.

## Code Review
- All contributions will be reviewed for clarity, accuracy, and consistency.
- Feedback will be provided if any adjustments are necessary.

Thank you for helping improve our documentation!
## Contributors Guide

The OpenKCM Documentation project uses Github to manage reviews of pull requests.

* If you are looking to make your first contribution, follow [Steps to Contribute](#steps-to-contribute)

* If you have a trivial fix or improvement, go ahead and create a pull request and
address (with @...) a suitable maintainer of this repository 
(see [CODEOWNERS](https://github.com/openkcm/openkcm.github.io/blob/main/CODEOWNERS) 
of this repository) in the description of the pull request.

* If you plan to do something more involved, first discuss your ideas by creating an 
[issue](https://github.com/openkcm/openkcm.github.io/issues) for this repository. This will avoid unnecessary work and surely give you 
and us a good deal of inspiration.

!!! note 
    Please follow these style guidelines to have your contribution considered by the maintainers:
    [Documentation style guidelines](https://github.com/openkcm/openkcm.github.io/blob/main/docs/contribute/style-guide.md)

## Steps to Contribute

Do you want to work on an issue? You are welcome to claim an existing one by commenting on it in GitHub. 

!!! note
    Perform a cursory search to see if the issue has already been taken by someone else. 
    This will prevent misunderstanding and duplication of effort from contributors on the same issue.

If you have questions about one of the issues please comment on them and one of the 
maintainers will clarify it.

We kindly ask you to follow the [Pull Request Checklist](#pull-request-checklist) to ensure reviews can happen accordingly.

## Contributing

You are welcome to contribute documentation to the OpenKCM Documentation project.

The following rules govern documentation contributions:

* Contributions must be licensed under the [Apache 2.0 License](http://www.apache.org/licenses/LICENSE-2.0)
* You need to sign the [Developer Certificate of Origin](#developer-certificate-of-origin).


## Developer Certificate of Origin

Due to legal reasons, contributors will be asked to accept a Developer Certificate of Origin (DCO) before they submit 
the first pull request to the OpenKCM, this happens in an automated fashion during the submission 
process. We use [the standard DCO text of the Linux Foundation](https://developercertificate.org/).

## Pull Request Checklist

* Fork and clone the repository to your local machine.

```shell
git clone git@github.com:openkcm/openkcm.github.io.git
cd openkcm.github.io
```

* Create a branch from the `main` using 'git checkout' command. 
!!! note 
    If needed, rebase to the current `main` branch before submitting your pull request. If it doesn't merge properly
    with `main` you may be asked to rebase your changes.

```shell
git checkout -b my_feature
# rebase if necessary
git fetch upstream main
git rebase upstream/main
```

* Commits should be as small as possible, while ensuring that each commit is correct independently 

* Commit your changes to your feature branch and push it to your fork.

```shell
git add .
git commit -m "Something meaningful"
git push origin my_feature
```

!!! note
    Alternatively you can amend your commit before pushing if you forgot something by using `git commit --amend`

* Create _Work In Progress [WIP]_ pull requests only if you need a clarification or an explicit review before you can 
continue your work item.

* If your patch is not getting reviewed, or you need a specific person to review it, you can @-reply a reviewer asking 
for a review in the pull request or a comment.

* Post review:
    * If a reviewer requires you to change your commit(s), please test the changes again.
    * Amend the affected commit(s) and force push onto your branch.
    * Set respective comments in your GitHub review as resolved.
    * Create a general PR comment to notify the reviewers that your amendments are ready for another round of review.

## Issues and Planning

We use GitHub issues to track bugs and enhancement requests. Please provide as much context as possible when you open an issue. The information you provide must be comprehensive enough to understand, reproduce the behavior and find related reports of that issue for the assignee. 
Therefore, contributors may use but aren't restricted to the issue template provided by the OpenKCM maintainers.

Thank you for helping improve our documentation!
