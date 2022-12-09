

{ pkgs, ... }:

with pkgs;

mkShell {
  buildInputs = [
    nodejs
    yarn
  ];
}
