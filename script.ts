// this script is interacting with our on-chain program to create a new project

import * as web3 from "@solana/web3.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

import {
  Service,
  HoneycombProject,
  Honeycomb,
  identityModule,
} from "@honeycomb-protocol/hive-control";

dotenv.config();

export type Config = {
  network: string;
  endpoint: string;
};

export const METADATA_PROGRAM_ID = new web3.PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s" // METAPLEX metadata
);

export const devnetConfig: Config = {
  network: "devnet",
  endpoint:
    "https://lingering-newest-sheet.solana-devnet.quiknode.pro/fb6e6465df3955a06fd5ddec2e5b003896f56adb/",
};

export const mainnetConfig: Config = {
  network: "mainnet-beta",
  endpoint: "https://api.metaplex.solana.com",
};
const services = [ //choose which services you want
  "assembler",
  "assetmanager",
  "tokenmanager",
  "paywall",
  "staking",
  "missions", //slicing to just 6 for now but can choose which ones we want
  "raffles",
  "guildkit",
  "gamestate",
  "matchmaking",
].slice(0, 6);
export const prepare = async () => {
  const network: "mainnet" | "devnet" = ["mainnet", "devnet"].includes(
    process.env.TEST_NETWORK_SOL as string
  )
    ? (process.env.TEST_NETWORK_SOL as "mainnet" | "devnet")
    : "devnet";
  const config = network === "mainnet" ? mainnetConfig : devnetConfig;
  console.log("");
  // const [signer, found] = [web3.Keypair.generate(), false];
  const [signer, found] = tryKeyOrGenerate(
    process.env.SOLANA_WALLET || "./keys/authority.json"
  );
  const connection = new web3.Connection(config.endpoint, "processed");
  const honeycomb = new Honeycomb(connection);
  honeycomb.use(identityModule(signer));
  return {
    honeycomb,
    config,
    signer,
    connection,
    projectName: "SolPatrol", //specify project name
    critarias: {
      collection: new web3.PublicKey(
        "7Zcfq1fdQYYjKreRoKSf6ungwrFGCgoPcapEeTkj1cQX"
      ),
    },
    profileDataConfigs: [ //these are all the variables that are going to be used and will be assigned to each user profile
      { label: "xp", dataType: { __kind: "SingleValue" } },
      { label: "level", dataType: { __kind: "SingleValue" } },
      { label: "bounty", dataType: { __kind: "SingleValue" } },
      { label: "resource1", dataType: { __kind: "SingleValue" } },
      { label: "resource2", dataType: { __kind: "SingleValue" } },
      { label: "resource3", dataType: { __kind: "SingleValue" } },
      {
        label: "Participations", // cost for is coming to this 0.01 SOL
        dataType: {
          __kind: "Entity",
          merkleTreeMaxDepth: 14,
          merkleTreeMaxBufferSize: 64,
        },
      },
    ],
    services: services.slice(0, 6), //this is where we slice the services from above 
    mints: await HoneycombProject._filterUniqueMints(
      require("./mints.json").map(
        (address: string) => new web3.PublicKey(address)
      )
    ),
  };
};

export function parseService(service: string, id: web3.PublicKey): Service {
  switch (service.toLocaleLowerCase()) {
    case "assembler":
      return {
        __kind: "Assembler",
        assemblerId: id,
      };
    case "assetmanager":
      return {
        __kind: "AssetManager",
        assetManagerId: id,
      };
    case "tokenmanager":
      return {
        __kind: "TokenManager",
      };
    case "paywall":
      return {
        __kind: "Paywall",
      };
    case "staking":
      return {
        __kind: "Staking",
        poolId: id,
      };
    case "missions":
      return {
        __kind: "Missions",
        projectId: id,
      };
    case "raffles":
      return {
        __kind: "Raffles",
        projectId: id,
      };
    case "guildkit":
      return {
        __kind: "GuildKit",
      };
    case "gamestate":
      return {
        __kind: "GameState",
      };
    case "matchmaking":
      return {
        __kind: "MatchMaking",
      };
    default:
      throw new Error("Invalid service");
  }
}

function tryKeyOrGenerate(keyPath: string): [web3.Keypair, boolean] { //utility function to generate a new key if you do not have one and lets add a note that will say you need some SOL and to view docs and if balance is less than design balance we will need to have it throw a catch error to nofity user to load up with x amount of sol
  try {
    return [
      web3.Keypair.fromSecretKey(
        Uint8Array.from(
          JSON.parse(fs.readFileSync(path.resolve(__dirname, keyPath), "utf8"))
        )
      ),
      true,
    ];
  } catch (e) {
    let k = web3.Keypair.generate();
    fs.writeFileSync(keyPath, JSON.stringify(k.secretKey));
    return [k, false];
  }
}

export function wait(seconds = 2): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

(async () => {
  let dependencies: {
    honeycomb: Honeycomb;
    config: Config;
    signer: web3.Keypair;
    connection: web3.Connection;
    projectName: string;
    services: string[];
    mints: web3.PublicKey[];
  };

  const {
    signer,
    honeycomb,
    mints,
    projectName,
    critarias,
    profileDataConfigs,
    services,
  } = (dependencies = await prepare());
  const balance =
    (await honeycomb.processedConnection.getAccountInfo(signer.publicKey))
      ?.lamports || 0;
  console.log({
    address: signer.publicKey.toString(),
    balance: balance / web3.LAMPORTS_PER_SOL,
    network: dependencies.config.network,
    rpcEndpoint: honeycomb.connection.rpcEndpoint,
  });
  if (balance / web3.LAMPORTS_PER_SOL < 0.1)
    throw new Error(
      "Insufficient SOLs, you need atleast 0.1 SOLs to create a project in keys/authority.json"
    );
  const project = await HoneycombProject.new(honeycomb, {
    name: projectName,
    expectedMintAddresses: mints.length,
    profileDataConfigs: profileDataConfigs as any,
  });

  console.log(projectName + " Project:", project.address.toString());
  honeycomb.use(project);

  const [driver] = tryKeyOrGenerate(
    process.env.SOLANA_WALLET || "./keys/driver.json"
  );

  await honeycomb.project().changeDriver(driver);

  await project.addCriteria(critarias);
  for (let serviceId of services) {
    const service = parseService(serviceId, web3.Keypair.generate().publicKey);
    console.log(`${service} service:`, serviceId.toString());
  }
})();
