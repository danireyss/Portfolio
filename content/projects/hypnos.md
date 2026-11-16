+++
title = "Hypnos"
category = "Embedded · Hackathon"
summary = "A nightstand device that scores your bedroom's sleep environment from 0 to 100, with a touch screen, a live web dashboard, and an assistant that explains the score from your own readings. Built at ShellHacks 2026."
tags = ["Rust", "Axum", "C++", "Arduino", "SQLite", "TypeScript", "React"]
featured = true
order = 5
date = "Sep 2026"
links = [{ label = "Source", url = "https://github.com/danireyss/Hypnos" }]
+++

## Overview

Hypnos scores your bedroom, not you. A small device on the nightstand measures the room's air, temperature, humidity, light, and sound every minute, turns them into a 0–100 sleep-environment score, and shows it on a touch screen and a web dashboard. When the score drops, you can ask the built-in assistant why, and it answers from your actual readings.

Everything runs on the device itself: no wearable, no health data, and no account. The only thing that leaves your network is a question to the assistant, and only when you ask one. It was built at ShellHacks 2026 on an Arduino UNO Q.

## How it works

- The UNO Q has two computers on one board, and Hypnos uses both. A C++ sketch on the microcontroller reads the sensors (a CCS811 for estimated CO₂ and VOCs, a DHT11 for temperature and humidity) and drives a 3.5" touch screen. Its Linux side runs a Rust backend.
- Readings cross between the two through the Arduino router over MessagePack-RPC. The backend validates them, flags suspect ones (sensor warm-up, missing or impossible values) so they don't skew the score, and stores them in SQLite.
- An optional USB webcam adds light and sound levels. Frames and audio are reduced to numbers in memory and never stored.
- Each metric gets a sub-score against target ranges from published research, and the minute's score is their average. Tapping the screen starts sleep mode, so a night is exactly the time you were asleep, with its own report and a calendar of past nights.
- The React dashboard updates live over Server-Sent Events. It's built into the backend binary, so the device needs no Node.js and works offline.
- The assistant looks up data through the same services the dashboard uses, and every number in its answer is checked against what it looked up, with any number it couldn't verify flagged.

## What's next

- A true CO₂ sensor (SCD41) in place of the CCS811's estimate, which only needs a new driver.
- Calibrating the light thresholds against real rooms.
- Trends across nights in the assistant, and switching on a fan or humidifier when a metric leaves its range.
