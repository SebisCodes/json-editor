/* The welcome example and the templates of "New". */

export const START = {
    name: 'Welcome',
    code: `{
  "editor": "JSON Editor",
  "about": "Edit the code on the left - the tree in the middle follows. Click a key or a value in the tree to change it there.",
  "version": 1.2,
  "free": true,
  "account": null,
  "features": [
    "tree with types and counts",
    "problems with line and column",
    "JSON Schema check",
    "convert to YAML, CSV and XML"
  ],
  "team": [
    { "name": "Ada", "role": "data", "since": 2019 },
    { "name": "Linus", "role": "code", "since": 2021 }
  ],
  "settings": {
    "theme": "auto",
    "indent": 2,
    "shortcuts": { "save": "Ctrl+S", "export": "Ctrl+E" }
  }
}
`,
};

export const TEMPLATES = {
    config: {
        name: 'Settings',
        code: `{
  "name": "my-app",
  "debug": false,
  "port": 8080,
  "database": {
    "host": "localhost",
    "user": "app",
    "pool": 10
  },
  "features": ["login", "search"]
}
`,
    },
    package: {
        name: 'package.json',
        code: `{
  "name": "my-package",
  "version": "1.0.0",
  "description": "",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "node --test"
  },
  "keywords": [],
  "license": "MIT",
  "dependencies": {}
}
`,
    },
    table: {
        name: 'Table',
        code: `[
  { "id": 1, "name": "Apple", "price": 1.2, "stock": 40, "organic": true },
  { "id": 2, "name": "Bread", "price": 3.5, "stock": 12, "organic": false },
  { "id": 3, "name": "Cheese", "price": 7.9, "stock": 5, "organic": true }
]
`,
    },
    schema: {
        name: 'Schema',
        code: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["name", "email"],
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "email": { "type": "string", "format": "email" },
    "age": { "type": "integer", "minimum": 0 },
    "tags": { "type": "array", "items": { "type": "string" }, "uniqueItems": true }
  },
  "additionalProperties": false
}
`,
    },
    geojson: {
        name: 'Map points',
        code: `{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [8.6, 47.69] },
      "properties": { "name": "Rhine Falls" }
    }
  ]
}
`,
    },
};

/* kind "jsonl": one JSON value per line */
TEMPLATES.jsonl = {
    name: 'Event log',
    kind: 'jsonl',
    code: `{"time": "2026-01-05T08:00:00Z", "level": "info", "message": "Server started", "port": 8080}
{"time": "2026-01-05T08:00:02Z", "level": "info", "message": "Connected to the database"}
{"time": "2026-01-05T08:03:41Z", "level": "warn", "message": "Slow request", "path": "/search", "ms": 1840}
{"time": "2026-01-05T08:04:10Z", "level": "error", "message": "Payment failed", "order": 1042}
`,
};

export const BLANK = '{\n}\n';
