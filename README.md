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

## Deployment Steps

1. Update mgit-repo-server (on macOS)
```bash
cd mgit-repo-server
# Replace public/index.html with your new content
git add public/index.html
git commit -m "Add Nostr login/register UI"
git push origin main
```

2. Build and push new Docker image (on Umbrel)

*Compromise Path*
Note: We are uploading a prebuilt image to Docker instead of letting Umbrel install the image from the custom community store due to an Umbrel bug on 0.5.4 that corrupts Dockerfile path

```bash
# SSH into Umbrel
cd /path/to/mgit-repo-server  # or git pull latest changes
git submodule update --init --recursive # for first time after the git clone
docker build --no-cache -t imyjimmy/mgit-repo-server:latest .
docker push imyjimmy/mgit-repo-server:latest
```

3. Happy Path: Sync to Umbrel app store (on macOS)
```bash
cd ../umbrel-community-app-store
./sync-mgit-repo-server.sh
git add mgitreposerver-mgit-repo-server/
git commit -m "Update mgit app with login UI"
git push
```

4. Compromise Path: Update containers (on Umbrel)
```bash
# Stop the mgit containers
docker stop mgitreposerver-mgit-repo-server_web_1
docker stop mgitreposerver-mgit-repo-server_tor_server_1  
docker stop mgitreposerver-mgit-repo-server_app_proxy_1

# Pull the new image
docker pull imyjimmy/mgit-repo-server:latest

# Remove the old web container and recreate with new image
docker rm mgitreposerver-mgit-repo-server_web_1

# Start new container with updated image
docker run -d --name mgitreposerver-mgit-repo-server_web_1 \
  --network umbrel_main_network \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos:/private_repos \
  imyjimmy/mgit-repo-server:latest

# Start the other containers back up
docker start mgitreposerver-mgit-repo-server_app_proxy_1
docker start mgitreposerver-mgit-repo-server_tor_server_1
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

## Setting Up a Medical Repository
1. `git clone` this repo *and* the `mgit` repo.

Have it set up as follows:
```
├── mgit
│   ├── clone.go
│   ├── cmd_config.go
│   ...
│   └── upload_pack.go
├── mgit-repo-server
│   ├── Dockerfile
│   ├── README.md
│   ├── docker-compose.yml
│   ...
│   ├── public
│   ├── security.js
│   ├── server.js
│   └── test-signing.html
├── private_repos // empty, just mkdir private_repos
```

2. build mgit go binary

```bash
cd mgit
go build
```

make sure you have MGITPATH set up and included in $PATH:
```bash
export MGITPATH=/path/to/mgit/binary
export PATH=/usr/bin:...:$MGITPATH:$PATH
```

3. Initialize an MGit repository:
```bash
cd ../private_repos/
mgit init
```

4. Add some test content:
   ```bash
   vim medical-history.json
   // add whatever content you like, save
   ```

5. Play around, there's a 1 to 1 mapping between mgit and git commands

### Initial Repository State
When a new repository is created via the API (POST /api/mgit/repos/create), it starts as a standard Git repository with initial medical history structure. At this point:

✅ Repository contains initial files (README.md, medical-history.json, directory structure)
❌ No MGit mappings exist yet (empty hash_mappings.json)
❌ Clone warnings about missing MGit metadata are expected

Populating MGit Mappings
MGit mappings are created automatically when users make commits using mgit commit:
bash# Standard git commits won't create MGit mappings
git commit -m "Update medical record"  # ❌ No MGit hash generated

# MGit commits create mappings between Git hashes, MGit hashes, and Nostr pubkeys  
mgit commit -m "Update medical record"  # ✅ Creates mapping in .mgit/mappings/hash_mappings.json
Once MGit commits are made:

MGit metadata becomes available for cloning
Repository reconstruction works properly
Full MGit functionality is enabled

Note: Repositories created through the API are immediately functional for standard Git operations and will gain full MGit capabilities as soon as users begin making commits with mgit commit.

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

### On Localhost using the browser
Fire up the server locally
Go to localhost:3003 and log in with nos2x signer
Perceive the JWT from the terminal that fired up the server

```
curl -X POST http://localhost:3003/api/mgit/repos/create \
  -H "Authorization: Bearer eyJhb[...token]" \
  -H "Content-Type: application/json" \
  -d '{"repoName": "my-medical-history", "description": "My personal health records"}'
```

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