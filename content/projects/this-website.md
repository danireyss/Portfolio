+++
title = "This Website"
category = "Full-stack"
summary = "My portfolio: a React + TypeScript frontend and a Rust Axum API, running serverless on AWS."
tags = ["Rust", "Axum", "TypeScript", "React", "AWS", "CDK"]
featured = true
order = 1
links = [{ label = "Source", url = "https://github.com/TODO/portfolio" }]
+++

## Architecture

The frontend is a React 19 + TypeScript single-page app built with Vite, styled with
Tailwind CSS, and animated with Motion, shadcn/ui, and Amicro components.

The API is a Rust [Axum](https://github.com/tokio-rs/axum) service. The same binary runs
locally as a normal HTTP server and on AWS Lambda through `lambda_http`. All of the site's
content, including this page, is TOML and Markdown embedded into the binary at compile time.

## Hosting

- S3 + CloudFront serve the frontend.
- CloudFront routes `/api/*` to API Gateway, which invokes the Lambda.
- The contact form sends email through Amazon SES.
- Everything is defined with the AWS CDK and deployed by GitHub Actions.
