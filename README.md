# carta-telemetry

Telemetry server for CARTA

# Installation

- Clone repo
- `npm install` to install dependencies
- `npm run build` to build package
- Run `dist/carta-telemetry` to start the telemetry server (Use `--help` for details)

### Generate private/public keys

`carta-telemetry` produces a UUID for each `/token` request. The uuid is wrapped in a [JWT](https://jwt.io/) and should be passed as the `Authorization: Bearer` token when
submitting telemetry at the `/submit` POST endpoint.

`carta-telemetry` needs an RSA pub/private key pair in order to sign and verify JWTs. By default, it expects to find them in the `/etc/carta/telemetry` folder.

Example code to generate the pair:

```shell
mkdir -p /etc/carta/telemetry
cd /etc/carta/telemetry
openssl genrsa -out key_private.pem 4096
openssl rsa -in key_private.pem -outform PEM -pubout -out key_public.pem
```