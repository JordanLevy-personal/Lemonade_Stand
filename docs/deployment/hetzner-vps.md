# Hetzner VPS Deployment

This guide deploys the game to a single Hetzner VPS with:

- Cloudflare managing DNS
- Nginx serving the built frontend
- A systemd-managed Node server for multiplayer WebSockets
- HTTPS on the public domain

## Architecture

- `dist/` is served by Nginx at `/`
- Nginx proxies `/ws` to the Node server on `127.0.0.1:3001`
- Cloudflare proxies public traffic to the VPS

This matches the client connection behavior in [`src/client/socket.ts`](/Users/jordanlevy/GitHub/personal/active/games/Roguelike_Lemonade_Stand/src/client/socket.ts), which connects to `wss://<domain>/ws` when the site is served over HTTPS.

## Assumptions

- Ubuntu 24.04 or similar on Hetzner
- Your code lives at `/var/www/lemonade-stand`
- Your domain is managed in Cloudflare
- Node.js 22.12+ and npm 10+ are installed so `node` and `npm` are available under `/usr/bin`

## 1. Install system packages

```bash
sudo apt update
sudo apt install -y nginx git ufw certbot python3-certbot-nginx ca-certificates curl gnupg
```

Install Node.js 22 from NodeSource, then confirm:

```bash
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt update
sudo apt install -y nodejs
node -v
npm -v
```

If `node -v` reports anything below `v22.12.0`, stop and upgrade Node before trying to install project dependencies.

## 2. Clone the repo and build the app

```bash
sudo mkdir -p /var/www
sudo chown "$USER":"$USER" /var/www
git clone <your-repo-url> /var/www/lemonade-stand
cd /var/www/lemonade-stand
npm ci
npm run build
```

If `npm ci` fails because your checkout does not include `package-lock.json`, run this once instead:

```bash
npm install
npm run build
```

After the lockfile is committed to the repo and pulled onto the server, switch back to `npm ci` for repeatable installs.

## 3. Configure the systemd service

Copy the service template:

```bash
sudo cp deploy/systemd/lemonade-stand.service /etc/systemd/system/lemonade-stand.service
```

Edit the file before enabling it:

- Replace `User=deploy` and `Group=deploy` with the account that owns `/var/www/lemonade-stand`
- Replace the working directory if you deployed elsewhere

```bash
sudo nano /etc/systemd/system/lemonade-stand.service
```

Start and enable the backend:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lemonade-stand.service
sudo systemctl status lemonade-stand.service
```

Confirm the backend is listening locally:

```bash
curl http://127.0.0.1:3001/health
```

## 4. Configure Nginx

Copy the site template:

```bash
sudo cp deploy/nginx/lemonade-stand.conf /etc/nginx/sites-available/lemonade-stand.conf
```

Edit these values before enabling it:

- Replace `lemonade-stand.jordanlevy.xyz` if you deploy to a different hostname
- Replace `/var/www/lemonade-stand`

```bash
sudo nano /etc/nginx/sites-available/lemonade-stand.conf
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/lemonade-stand.conf /etc/nginx/sites-enabled/lemonade-stand.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Configure the firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Port `3001` should stay private. Only Nginx should be exposed publicly.

## 6. Point Cloudflare at the VPS

Create Cloudflare DNS records:

- `A` record for `@` pointing to the VPS IPv4 address
- `A` record for `www` pointing to the same VPS IPv4 address

Recommended first pass:

- Start with Cloudflare proxy disabled while the origin is being verified
- After HTTPS is working, turn the proxy back on

## 7. Issue HTTPS certificates

Once DNS resolves to the VPS:

```bash
sudo certbot --nginx -d lemonade-stand.jordanlevy.xyz
```

After Certbot updates Nginx, test and reload if needed:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

In Cloudflare, set SSL/TLS encryption mode to `Full (strict)` after the origin certificate is valid.

## 8. Verify the live deployment

### Basic checks

```bash
curl -I https://lemonade-stand.jordanlevy.xyz
```

In a browser:

- Open `https://lemonade-stand.jordanlevy.xyz`
- Confirm the page loads without mixed-content warnings
- Open DevTools and confirm there is a successful `wss://lemonade-stand.jordanlevy.xyz/ws` connection

### Manual multiplayer checks

1. Open the game on two devices or in two separate browser profiles.
2. On player one, create a room and note the room code.
3. On player two, join using that room code.
4. Confirm both players appear in the same room.
5. Submit plans from both sides.
6. Confirm the shared simulation runs and the results screen appears for both players.
7. Request the next day from both players and confirm the room returns to planning.
8. Refresh one browser and confirm reconnect behavior still works.

## Updating the deployment

From the VPS:

```bash
cd /var/www/lemonade-stand
git pull
npm ci
npm run build
sudo systemctl restart lemonade-stand.service
sudo systemctl reload nginx
```

## GitHub Action Deploys

The repo includes a GitHub Actions workflow at `.github/workflows/deploy-vps.yml` that can deploy automatically after pushes to `main`, or manually with `workflow_dispatch`.

### GitHub repository setup

Add these repository secrets:

- `VPS_HOST`: public hostname or IP of the VPS
- `VPS_USER`: SSH user that owns the deploy checkout
- `VPS_SSH_KEY`: private SSH key for that user

Add these repository variables if you need to override the defaults:

- `VPS_DEPLOY_PATH`: defaults to `/var/www/lemonade-stand`
- `VPS_SYSTEMD_SERVICE`: defaults to `lemonade-stand.service`
- `VPS_SSH_PORT`: defaults to `22`

### VPS prerequisites for GitHub deploys

- The VPS user must already be able to SSH in with the configured key.
- That user must be able to run `sudo systemctl restart lemonade-stand.service` and `sudo systemctl reload nginx`.
- The repo checkout at `/var/www/lemonade-stand` must already exist on the VPS.
- The checkout must be able to `git pull origin main` non-interactively.

If the repo is private, configure deploy credentials on the VPS before relying on the GitHub Action.

### What the workflow does

On deploy, the workflow SSHes into the VPS and runs:

```bash
cd /var/www/lemonade-stand
git fetch --prune origin
git checkout main
git pull --ff-only origin main
npm ci
npm run build
sudo systemctl restart lemonade-stand.service
sudo systemctl reload nginx
curl --fail http://127.0.0.1:3001/health
```

The health check is the last step so the workflow fails if the backend does not come back up cleanly.

## Troubleshooting

Backend logs:

```bash
sudo journalctl -u lemonade-stand.service -n 200 --no-pager
```

Nginx config test:

```bash
sudo nginx -t
```

Nginx logs:

```bash
sudo tail -n 100 /var/log/nginx/error.log
sudo tail -n 100 /var/log/nginx/access.log
```
