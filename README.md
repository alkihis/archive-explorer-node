# archive-explorer-node

Serve requests for the Archive Explorer project.

This is the back-end side of the Archive Explorer project. See [archive-explorer-web](https://github.com/alkihis/archive-explorer-web) for the front-end website.

## Foreword

None of the pages served to clients are server-side rendered. This server provides **static** access to the bundled React website, and gives access to an API developed with the **Express** framework.

API exposes multiple REST endpoints and a WebSocket powered by  **Socket.io**.

This server needs a open **mongoDB** server to store user credentials and tweets/twitter users cache, internally opered by **mongoose**.

The whole project is developed in **TypeScript**.

**Worker threads** are used to dispatch tweet delete requests, so make sure you have a Node version that support the `worker_threads` module !

Supported Node versions are **Node 10.5+** with `--experimental-worker` flag, or **Node 12+** without flags.

## Getting started for development

Clone repository and install dependencies with NPM.

```bash
git clone https://github.com/alkihis/archive-explorer-node.git
cd archive-explorer-node
npm i
```

### Setting up constants

Some constants are not built-in, to provide security.

#### Twitter constants

You must have a working Twitter application in order to run server. This could be long to obtain, but I just can't share my own credentials.

Duplicate the file `settings.sample.json` and name it `settings.json`.

Set up inside the newly created file your Twitter application token (`consumer` key), the application secret key (`consumer_secret` key), and the callback after Sign in with Twitter login flow (`localhost:3000/finalize` should be fine for development, change it for production).

#### Public and private keys

This server use `JWT` (JSON Web Tokens) as token system. This kind of credentials requires a couple of public/private keys in order to sign tokens.

Create a `.ssh` folder in the directory root.
Go to this directory.
Create a public and private key **with a passphrase**.

All the created files will **not** be gitted to your fork or repo.
```bash
# Creating dir
mkdir .ssh
cd .ssh

# Generating private key (do not forget to enter a passphrase when asked)
openssl genpkey -aes-256-cbc -algorithm RSA -out key_new.pem -pkeyopt rsa_keygen_bits:2048

# Generating public key
openssl rsa -pubout -in key_new.pem -out key_new

# Register the passphrase in the file "passphrase"
echo "my_choosen_passphrase" > passphrase
```

Project is ready !

### Compiling and running project

You need to first compile the project in order to start the index.js file with Node. Make sure *TypeScript* npm package is installed globally.

```bash
tsc
```

Now, make sure the **mongoDB** server is running, then start the server:

```bash
node build/index.js -l <logLevel> -p <emitPort> -m <mongoDBPort>
```

Default values are:
- `-l info`
- `-p 3128`
- `-m 3281`

You can ask for help with `--help`.

## Deploy

To deploy server, you need to provide some changes to `index.ts` in order to emit over HTTPS to the right ports.
