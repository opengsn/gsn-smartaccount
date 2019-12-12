const SmartAccountFactory = artifacts.require("./SmartAccountFactory.sol");
const Gatekeeper = artifacts.require("./SmartAccount.sol");
const Utilities = artifacts.require("./Utilities.sol");
const RelayHub = artifacts.require("RelayHub");


module.exports = async function (deployer) {
    await deployer.deploy(Utilities);
    deployer.link(Utilities, SmartAccountFactory);
    await deployer.deploy(RelayHub);
    deployer.link(Utilities, Gatekeeper);
    let zeroAddress = "0x0000000000000000000000000000000000000000";
    await deployer.deploy(SmartAccountFactory, zeroAddress,{gas:9e6});
    // I think there is a bug in truffle, trying to deploy Gatekeeper first causes an error for no reason
    // console.log("Deploying Gatekeeper");
    let gatekeeper = await deployer.deploy(Gatekeeper, zeroAddress, zeroAddress, {gas:8e6});
    // console.log("Gatekeeper ", Gatekeeper.address);
};
