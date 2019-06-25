pragma solidity ^0.5.8;

import "../DelayedOps.sol";

/**
 * test class to test delayed ops.
 */
contract TestDelayedOps is DelayedOps {

    address public allowedSender;
    uint256 public allowedExtraData;
    uint256 operationsDelay = 1 hours;

    function setAllowedSender(address s) public {
        allowedSender = s;
    }

    function setAllowedExtraData(uint256 data) public {
        allowedExtraData = data;
    }

    function validateOperation(address sender, uint256 extraData,bytes4 methodSig) internal {
        require(
            methodSig == this.sayHelloWorld.selector ||
            methodSig == this.addSome.selector ||
            methodSig == this.doIncrement.selector,
            "test: delayed op not allowed");
        require(msg.sender == allowedSender, "this sender not allowed to apply delayed operations");
        require(extraData == allowedExtraData, "extraData is not allowed");

    }

    function sendBatch(bytes memory batch, uint256 extraData) public {
        uint pos = 0;
        bytes memory operation;
        while (pos != EOF) {
            (operation, pos) = nextParam(batch, pos);
            require(LibBytes.readBytes4(operation, 0) != this.sayHelloWorld.selector, "Cannot use sendBatch to schedule secure HelloWorld");
        }
        scheduleDelayedBatch(msg.sender, extraData, operationsDelay, getNonce(), batch);
    }

    function scheduleHelloWorld(uint dayOfBirth, string memory message, uint256 delay) public {
        if (dayOfBirth == 4) {
            require(delay >= 2 hours, "Born on thursdays must delay by 2 hours");
        }
        else {
            require(delay >= 2 days, "Everybody must delay by 2 days");
        }
        bytes memory delayedTransaction = abi.encodeWithSelector(this.sayHelloWorld.selector, msg.sender, dayOfBirth, message);
        bytes memory operation = abi.encodePacked(delayedTransaction.length, delayedTransaction);
        scheduleDelayedBatch(msg.sender, 0, delay, getNonce(), operation);
    }

    function applyOp(bytes memory operation, uint256 extraData, uint256 nonce) public {
        applyDelayedOps(msg.sender, extraData, nonce, operation);
    }

    function operationMissingFromValidate(address sender, uint256 delay) public {}

    event DumpSenders(address msgsender, address sender, address allowed);

    event HelloWorld(address sender, string message);

    /**
    *
    * @param sender - forced by the 'delayed' protocol. Guaranteed to be the original scheduler of the transaction.
    * @param dayOfBirth - added to demonstrate that the deciding the delay duration can be done beyond the protocol.
    * @param message - just a message to emit.
    */
    function sayHelloWorld(address sender, uint dayOfBirth, string memory message) public {
        emit HelloWorld(sender, message);
    }

    uint public counter;

    function doIncrement() public {
        require(msg.sender == address(this), "this operation must be scheduled");
        counter++;
    }

    uint256 public someValue = 0;

    function addSome(uint256 howMuch) public {
        someValue = someValue + howMuch;
    }


}
