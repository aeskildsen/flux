{
  # Tailor created this file. It no longer uses Tailor's nix/ fragments
  # (loader.nix, hooks.nix): Flux has no Tailor language enabled, and the
  # GPU driver hook has no use here. Tailor writes nix/ again on each
  # `tailor alter`, so .gitignore ignores it.
  description = "Development shell for Flux";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    nix-packages.url = "github:wimpysworld/nix-packages";
    nix-packages.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    {
      nixpkgs,
      nix-packages,
      ...
    }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-darwin"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          # Keep the development shell available when Tailor has no package for this system.
          tailorPkgs = nix-packages.packages.${system} or { };
        in
        {
          default = pkgs.mkShell {
            packages =
              with pkgs;
              [
                actionlint
                gh
                just
                # Node at the major version in .node-version. pnpm reads
                # packageManager in package.json and runs that exact version.
                # sclang (for pnpm build:synthdefs) comes from the host.
                # Browser tests run in the CI image: pnpm test:container.
                nodejs_26
                pnpm_11
              ]
              ++ (if tailorPkgs ? tailor then [ tailorPkgs.tailor ] else [ ]);
          };
        }
      );
    };
}
