+++
title = "8-Puzzle Game with Image Processing"
category = "Web app · Algorithms"
summary = "A web-based sliding puzzle that turns uploaded images into playable 8-puzzles and solves them with A* search."
tags = ["Python", "Flask", "JavaScript", "HTML", "CSS"]
featured = true
order = 2
date = "Sep 2025"
links = [{ label = "Source", url = "https://github.com/danireyss/8_puzzle_game" }]
+++

## Overview

A web-based puzzle game that transforms user-uploaded images into playable sliding puzzles.

## How it works

- Solutions come from A\* pathfinding with a Manhattan distance heuristic, which finds the optimal sequence of moves.
- A Flask backend serves a RESTful API to an interactive JavaScript frontend.
- Five different search algorithms are supported, so they can be compared side by side for learning.

## Results

Complex puzzles solve in under a second.
