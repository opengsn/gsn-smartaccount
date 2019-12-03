const VaultFactory = artifacts.require("./VaultFactory.sol");
const crypto = require("crypto");

contract('VaultFactory', function (accounts) {

    it("should deploy vault and gatekeper", async function () {
        let vaultFactory = await VaultFactory.deployed();

        let res = await vaultFactory.newVault(crypto.randomBytes(32));
        let event = res.logs[0];

        assert.equal(event.event, "VaultCreated");
        assert.equal(event.args.sender, accounts[0]);
    });

    after("write coverage report", async () => {
        await global.postCoverage()
    });
});
