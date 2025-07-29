# RAG PDF - Hono Application

A basic Hono web application built with Bun.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed on your system

### Installation

```bash
bun install
```

### Development

Start the development server:

```bash
bun run dev
```

The application will be available at `http://localhost:3000`

### Testing

Run the test suite:

```bash
bun test
```

## API Endpoints

- `GET /` - Returns "Hello Hono!"
- `GET /api/hello` - Returns a JSON response with a message and timestamp
- `POST /api/echo` - Echoes back the JSON data sent in the request body

## Example Usage

```bash
# Get the root page
curl http://localhost:3000/

# Get JSON response
curl http://localhost:3000/api/hello

# Echo data
curl -X POST http://localhost:3000/api/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello World"}'
```
