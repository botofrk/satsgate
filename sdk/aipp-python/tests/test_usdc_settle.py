import unittest
from unittest.mock import MagicMock, patch
from aipp import Aipp, BASE_USDC_CONTRACT, BASE_CHAIN_ID

class TestPayAndSettleUsdc(unittest.TestCase):
    def setUp(self):
        self.api_key = "aipp_test_py_key"
        self.base_url = "https://mock.aipp.dev"
        self.client = Aipp(api_key=self.api_key, base_url=self.base_url)

    def test_happy_path(self):
        mock_tx_hash = "0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000"
        mock_payment_hash = "x402_py123"
        mock_access_token = "tok_py_123"
        mock_pay_to = "0xGatewayAddress123"

        send_tx_mock = MagicMock(return_value=mock_tx_hash)

        def mock_request(method, url, **kwargs):
            response_mock = MagicMock()
            response_mock.ok = True
            if f"/invoice/status/{mock_payment_hash}" in url:
                self.assertIn(f"tx_hash={mock_tx_hash}", url)
                response_mock.json.return_value = {
                    "paid": True,
                    "status": "settled",
                    "preimage": mock_tx_hash
                }
            elif "/t/tag_py/access-token" in url:
                body = kwargs.get("json", {})
                self.assertEqual(body.get("payment_hash"), mock_payment_hash)
                self.assertEqual(body.get("access_claim_secret"), "secret_py")
                response_mock.json.return_value = {
                    "access_token": mock_access_token,
                    "token_type": "Bearer",
                    "expires_at": "2026-12-31T23:59:59.000Z"
                }
            elif "/t/tag_py/content" in url:
                headers = kwargs.get("headers", {})
                self.assertEqual(headers.get("Authorization"), f"Bearer {mock_access_token}")
                response_mock.json.return_value = {
                    "success": True,
                    "tag_id": "tag_py",
                    "title": "Python Article",
                    "message": "AIPP payment completed.",
                    "content": {"data": "Python Insight"}
                }
            else:
                response_mock.ok = False
                response_mock.status_code = 404
                response_mock.reason = "Not Found"
            return response_mock

        self.client.session.request = MagicMock(side_effect=mock_request)

        result = self.client.pay_and_settle_usdc(
            payment_hash=mock_payment_hash,
            amount_usd=0.01,
            pay_to=mock_pay_to,
            tag_id="tag_py",
            access_claim_secret="secret_py",
            send_usdc_transaction=send_tx_mock,
            fetch_content=True,
            poll_interval_sec=0.01,
            timeout_sec=5.0
        )

        send_tx_mock.assert_called_once_with({
            "to": mock_pay_to,
            "amount_units": 10000,
            "amount_usd": 0.01,
            "token_contract": BASE_USDC_CONTRACT,
            "chain_id": BASE_CHAIN_ID
        })

        self.assertTrue(result.paid)
        self.assertEqual(result.status, "settled")
        self.assertEqual(result.stage, "COMPLETED")
        self.assertEqual(result.tx_hash, mock_tx_hash)
        self.assertEqual(result.access_token, mock_access_token)
        self.assertEqual(result.content.get("content", {}).get("data"), "Python Insight")

    def test_resume_with_existing_tx_hash(self):
        existing_hash = "0xExistingPyTx"
        mock_payment_hash = "x402_resume_py"
        send_tx_mock = MagicMock()

        def mock_request(method, url, **kwargs):
            response_mock = MagicMock()
            response_mock.ok = True
            if f"/invoice/status/{mock_payment_hash}" in url:
                self.assertIn(f"tx_hash={existing_hash}", url)
                response_mock.json.return_value = {
                    "paid": True,
                    "status": "settled",
                    "preimage": existing_hash
                }
            return response_mock

        self.client.session.request = MagicMock(side_effect=mock_request)

        result = self.client.pay_and_settle_usdc(
            payment_hash=mock_payment_hash,
            amount_usd=0.05,
            pay_to="0xGateway",
            existing_tx_hash=existing_hash,
            send_usdc_transaction=send_tx_mock
        )

        send_tx_mock.assert_not_called()
        self.assertTrue(result.paid)
        self.assertEqual(result.stage, "SETTLED")
        self.assertEqual(result.tx_hash, existing_hash)

    def test_transfer_success_proof_failure_no_double_pay(self):
        mock_tx_hash = "0xSentTxSuccessPy"
        mock_payment_hash = "x402_fail_proof_py"
        send_tx_mock = MagicMock(return_value=mock_tx_hash)

        def mock_request(method, url, **kwargs):
            response_mock = MagicMock()
            response_mock.ok = False
            response_mock.status_code = 502
            response_mock.reason = "Bad Gateway"
            response_mock.json.return_value = {"error": "Bad Gateway"}
            return response_mock

        self.client.session.request = MagicMock(side_effect=mock_request)

        result = self.client.pay_and_settle_usdc(
            payment_hash=mock_payment_hash,
            amount_usd=0.01,
            pay_to="0xGateway",
            send_usdc_transaction=send_tx_mock
        )

        send_tx_mock.assert_called_once()
        self.assertFalse(result.paid)
        self.assertEqual(result.stage, "PAYMENT_SENT_PROOF_PENDING")
        self.assertEqual(result.tx_hash, mock_tx_hash)
        self.assertIn("initial proof submission failed", result.error)
        self.assertIn("Resume using existing_tx_hash", result.error)

    def test_invalid_contract_rejected(self):
        send_tx_mock = MagicMock()
        with self.assertRaises(ValueError) as cm:
            self.client.pay_and_settle_usdc(
                payment_hash="x402_bad",
                amount_usd=0.01,
                pay_to="0xGateway",
                token_contract="0xWrongContract",
                send_usdc_transaction=send_tx_mock
            )
        self.assertIn("Invalid token contract", str(cm.exception))
        send_tx_mock.assert_not_called()

    def test_settlement_timeout(self):
        mock_tx_hash = "0xTimeoutPy"
        mock_payment_hash = "x402_timeout_py"
        send_tx_mock = MagicMock(return_value=mock_tx_hash)

        def mock_request(method, url, **kwargs):
            response_mock = MagicMock()
            response_mock.ok = True
            response_mock.json.return_value = {
                "paid": False,
                "status": "pending"
            }
            return response_mock

        self.client.session.request = MagicMock(side_effect=mock_request)

        result = self.client.pay_and_settle_usdc(
            payment_hash=mock_payment_hash,
            amount_usd=0.01,
            pay_to="0xGateway",
            send_usdc_transaction=send_tx_mock,
            poll_interval_sec=0.01,
            timeout_sec=0.05
        )

        self.assertFalse(result.paid)
        self.assertEqual(result.stage, "PROOF_SUBMITTED")
        self.assertEqual(result.tx_hash, mock_tx_hash)
        self.assertIn("Settlement polling timed out", result.error)
        self.assertIn("resume using existing_tx_hash", result.error)

if __name__ == "__main__":
    unittest.main()
