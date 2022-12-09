# tailscale-prometheus-sd

Prometheus Service Discovery for Tailscale which automatically discovers exporters running on nodes within your Tailscale Network (tailnet).

Unlike alternatives in this space, tailscale-prometheus-sd uses the local Tailscale API and Tailscale Service Collection (https://tailscale.com/kb/1100/services/) to discover exporters running across your network.

As it uses the Tailscale localapi, it also works with [Headscale](https://github.com/juanfont/headscale) with a small patch needed to enable service collection:

```
diff --git a/api_common.go b/api_common.go
--- a/api_common.go
+++ b/api_common.go
@@ -63,8 +63,9 @@
 		Domain:       h.cfg.BaseDomain,
 		PacketFilter: h.aclRules,
 		DERPMap:      h.DERPMap,
 		UserProfiles: profiles,
+		CollectServices: "true",
 		Debug: &tailcfg.Debug{
 			DisableLogTail:      !h.cfg.LogTail.Enabled,
 			RandomizeClientPort: h.cfg.RandomizeClientPort,
 		},

```

## Usage

tailscale-prometheus-sd is currently packaged via Nix.

Run with `TAILSCALE_PROMETHEUS_SD_CONFIG=path/to/config.json PROMETHEUS_TARGETS_OUT=path/to/targets.json nix run madjam002/tailscale-prometheus-sd`.

Example config.json:

```
{
  "matchers": [
    { "description": "node-exporter" }, // match services collected by description (Tailscale infers this from the process name automatically)
    { "port": 9100 } // match services collected by the port that the service is listening on (9100 is typically used for node-exporter)
  ]
}
```

Services that are matched using `matchers` in the config.json will be written to the Prometheus service discovery file.

## Developing

Make sure Nix is installed, and preferably direnv, otherwise run `nix develop` in this repo to start a development shell.

Then run `TAILSCALE_PROMETHEUS_SD_CONFIG=./config.example.json PROMETHEUS_TARGETS_OUT=./targets.example.json yarn node -r esbuild-register .`

## License

Licensed under the MIT License.

View the full license [here](/LICENSE).
