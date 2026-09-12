+++
title = "Premier League Fantasy Dashboard"
category = "Data · Sports analytics"
summary = "A live Premier League and Fantasy Premier League dashboard on the free FPL API, with match history, position-ranked player stats, and expected-points projections."
tags = ["Python", "Polars", "Streamlit", "Docker"]
featured = true
order = 4
date = "Sep 2026"
links = [{ label = "Source", url = "https://github.com/danireyss/Premier-League-Fantasy" }]
+++

## Overview

flive is a Premier League dashboard built entirely on the official Fantasy Premier League API, with no API key and no paid data feed. Across six tabs it covers live scores and expected goals, season stats, player comparisons, price and ownership moves, and live fantasy scoring.

It adds three things FPL itself doesn't: a history of the live feed, which FPL doesn't keep; player rankings against others in the same position rather than against everyone; and expected-points projections for fixtures that haven't been played yet.

## How it works

- A background ingest daemon polls the FPL API on two loops: every 60 seconds while matches are live (dropping to every 5 minutes when nothing is in play), and every 6 hours for players, clubs, and fixtures.
- Every poll appends a snapshot to Hive-partitioned Parquet files instead of updating rows, which builds the minute-by-minute history FPL doesn't store. Parquet also allows one writer and any number of readers, so the daemon and the dashboard run as separate processes.
- The Streamlit dashboard reads that store with Polars, which pushes filters down into the Parquet files.
- Expected points are the sum of nine scoring components, from appearance and goals to bonus and cards, each shown as its own column. Club attack and defence ratings are derived from the players' own xG data and pulled toward the league average early in the season, so one lopsided result doesn't decide a rating.
- It runs locally with uv, or with a single `docker compose up`.

## What's next

- Using last season's numbers as a starting point, so early-season projections rest on more than a couple of matches.
- A squad optimiser that picks the best team within FPL's budget, formation, and three-per-club rules.
