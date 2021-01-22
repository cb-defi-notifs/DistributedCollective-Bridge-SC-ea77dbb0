# Sovryn Token Bridge and Converter

## Deploy

1. Deploy Bridge on RSK and Ethereum. See [Briedge README](./sovryn-token-bridge/bridge/README.md)
2. Deploy Converter contract on RSK. See [Converter README](./token-converter/README.md)
3. Ensure the Federator account has balance on both networks.
4. Copy Bridge configs to ops/environment/configs directory, where environment is staging|uat|production.
   1. config.js
   2. mainchain JSON file. It was generated by the deploy script in `/federator/config/` directory using the networkName as the file name.
   3. sidechain JSON file. It was generated by the deploy script in `/federator/config/` directory using the networkName as the file name.
   4. federator.key
   5. db directory
5. Change Contract addresses in ui/index.html. You can search "CONFIGS" in the file to found the place where they are configured.
6. Copy the above files to server running `./ops.sh --config-server environment`.
7. Edit `ops/docker/docker-compose-base.yml` file with the pertinent docker images.
8. Push `ops/docker/docker-compose-base.yml` to a release branch.
9. Run deploy pipe from gitlab.