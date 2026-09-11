+++
title = "Warehouse Management System"
category = "Full-stack · Nonprofit"
summary = "Inventory and shipment management for Global Empowerment Mission, built with a six-person team on Next.js, TypeScript, and PostgreSQL."
tags = ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "React"]
featured = true
order = 3
date = "May 2026"
+++

## Overview

A full-stack warehouse management system for Global Empowerment Mission, a Miami nonprofit, built
during my internship as part of a six-person team.

## Stack

- Next.js 16 App Router, TypeScript, and PostgreSQL
- Better Auth for session authentication
- Prisma ORM, with a normalized data model for pallets, donors, companies, and warehouses
- A TanStack Table inventory dashboard

## Highlights

- Shipment documentation and audit logging happen automatically when an order is created: React PDF
  generates documents into Google Drive, and each order is logged through the Google Sheets API,
  eliminating manual report steps.
- The backend follows a controller/service/repository architecture, and React dropdowns support
  real-time add and delete through REST APIs.
