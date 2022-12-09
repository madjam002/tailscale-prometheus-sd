{
  inputs = {
    nixpkgs.url = github:nixos/nixpkgs/nixos-22.11;
    utils.url = github:numtide/flake-utils;
    yarnpnp2nix.url = github:madjam002/yarnpnp2nix;
    yarnpnp2nix.inputs.nixpkgs.follows = "nixpkgs";
    yarnpnp2nix.inputs.utils.follows = "utils";
  };

  outputs = inputs@{ self, nixpkgs, utils, ... }:
    let
      nixpkgsLib = nixpkgs.lib;
    in
    (utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [
            (final: prev: {
              nodejs = prev.nodejs-18_x;
              yarn = (prev.yarn.override { nodejs = prev.nodejs-18_x; });
            })
          ];
        };

        mkYarnPackagesFromManifest = inputs.yarnpnp2nix.lib."${system}".mkYarnPackagesFromManifest;
        runnerYarnPackages = mkYarnPackagesFromManifest {
          inherit pkgs;
          yarnManifest = import ./yarn-manifest.nix;
          packageOverrides = {
            "tailscale-prometheus-sd@workspace:.".build = ''
              esbuild --platform=node --bundle src/index.ts --outdir=dist
            '';
          };
        };
      in
      rec {
        devShell = import ./shell.nix {
          inherit pkgs;
        };
        packages = {
          default = runnerYarnPackages."tailscale-prometheus-sd@workspace:.";
        };
      }
    )) // {
      lib = import ./nix/lib { lib = nixpkgsLib; };
    };
}
