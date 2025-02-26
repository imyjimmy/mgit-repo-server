# MGit Repository Server

This server provides authentication and repository access for MGit, a Git wrapper that integrates with Nostr public keys for authentication. The server handles user authentication via Nostr and manages repository access based on user public keys.

## Features

- Nostr-based authentication for repository access
- Secure challenge-response workflow
- Role-based access control (admin, read-write, read-only)
- JWT token-based authorization
- Docker containerization for easy deployment

## Directory Structure

```
server/
├── Dockerfile            # Docker configuration
├── docker-compose.yml    # Docker Compose configuration
├── server.js             # Main server application
├── security.js           # Security configuration
├── package.json          # Node.js dependencies
├── test-signing.html     # Browser testing tool for authentication
└── public/               # Static files for web interface
```

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development without Docker)
- Python 3 (for running the test script server)
- A Nostr browser extension (like nos2x) for testing authentication

## Configuration

By default, repositories are stored in the `private_repos` directory at the same level as the `server` directory. In the Docker container, this is mounted to `/private_repos`.

### Repository Configuration

Repositories and authorized keys are configured in the `repoConfigurations` object in `server.js`:

```javascript
let repoConfigurations = {
  'hello-world': {
    authorized_keys: [
      { pubkey: 'npub19jlhl9twyjajarvrjeeh75a5ylzngv4tj8y9wgffsguylz9eh73qd85aws', access: 'admin' },
      { pubkey: 'npub1gpqpv9rsdt04jhqgz3w3sh4xr8ns0zz8677j3uzhpw8w6qq3za8sdqhh2f', access: 'read-only' }
    ]
  },
};
```

## Docker Setup

### Building and Starting the Container

```bash
# Navigate to the server directory
cd server

# Build the Docker container
docker-compose build

# Start the container
docker-compose up -d
```

The server will be available at http://localhost:3003

### Stopping the Container

```bash
# Stop the container
docker-compose down
```

### Viewing Logs

```bash
# Follow the logs
docker-compose logs -f
```

### Rebuilding the Container

If you make changes to the code, rebuild the container:

```bash
# Rebuild without cache
docker-compose build --no-cache

# Restart with new build
docker-compose down && docker-compose up -d
```

## Setting Up a Test Repository

1. Create a directory for the repository in the `private_repos` directory:
   ```bash
   mkdir -p ../private_repos/hello-world
   ```

2. Initialize an MGit repository:
   ```bash
   cd ../private_repos/hello-world
   ../../mgit/mgit init
   ```

3. Add some test content:
   ```bash
   echo "# Hello World" > README.md
   ../../mgit/mgit add README.md
   ../../mgit/mgit commit -m "Initial commit"
   ```

## API Routes

### Authentication Routes

- **POST /api/mgit/auth/challenge**
  - Generates a challenge for authentication
  - Requires: `{ repoId: "repository-name" }`
  - Returns: `{ challenge: "random-string", repoId: "repository-name" }`

- **POST /api/mgit/auth/verify**
  - Verifies a signed challenge and issues a JWT token
  - Requires: `{ signedEvent: {...}, challenge: "string", repoId: "string" }`
  - Returns: `{ status: "OK", token: "jwt-token", access: "permission-level", expiresIn: seconds }`

- **POST /api/auth/nostr/verify**
  - Alternative authentication endpoint for general Nostr verification
  - Requires: `{ signedEvent: {...} }`
  - Returns: `{ status: "OK", pubkey: "hex-pubkey", metadata: {...}, token: "jwt-token" }`

### Repository Access Routes

- **GET /api/mgit/repos/:repoId/info**
  - Gets information about a repository
  - Requires: Authentication token in Authorization header
  - Returns: Repository information object

- **GET /api/mgit/repos/:repoId/git-upload-pack**
  - Git protocol endpoint for fetching data
  - Requires: Authentication token in Authorization header

## Testing Authentication

### Using the Test Signing Tool

1. Start a Python HTTP server to serve the test-signing.html file:
   ```bash
   cd server
   python -m http.server 8000
   ```

2. Open a browser and navigate to http://localhost:8000/test-signing.html

3. Follow the steps in the interface:
   - Enter the repository ID (e.g., "hello-world")
   - Click "Get Challenge" to generate a challenge
   - Click "Sign with nos2x" to sign the challenge with your Nostr extension
   - Click "Verify Signature" to verify and get a token
   - Click "Test Repository Access" to confirm access

### Required Browser Extensions

- A Nostr browser extension like [nos2x](https://github.com/fiatjaf/nos2x) is required for signing challenges

## Security Considerations

- The server uses helmet.js for secure HTTP headers
- Rate limiting is implemented to prevent brute force attacks
- Repository paths are validated to prevent path traversal attacks
- All authentication tokens have a configured expiration time

## Troubleshooting

### Common Issues

1. **"Error: No nostr provider found"**: Install a Nostr browser extension like nos2x
2. **"Not authorized for this repository"**: Check that your Nostr pubkey is in the authorized_keys for the repository
3. **"Invalid signature"**: Ensure you're using the correct Nostr extension and key
4. **"Repository not found"**: Verify that the repository directory exists and has been initialized with MGit

### Checking Container Status

```bash
docker-compose ps
```

### Inspecting Container

```bash
docker exec -it mgit-repo-server sh
```

## Development Notes

- The server is configured to run on port 3003 by default
- JWT tokens expire after 30 minutes (configurable in server.js)
- The Docker container builds MGit from source code