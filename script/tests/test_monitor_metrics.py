import json
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import requests

import monitor_zai_inference as monitor


class FakeResponse:
    def __init__(self, status_code: int, lines: list[str]):
        self.status_code = status_code
        self._lines = lines

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def iter_lines(self, decode_unicode: bool = True):
        for line in self._lines:
            yield line


class MonitorMetricTests(unittest.TestCase):
    def setUp(self):
        self.cfg = monitor.Config(
            zai_api_key="test-key",
            zai_base_url="https://example.test/v4",
            zai_model="glm-5",
            mongodb_uri="mongodb://example.test",
            request_retries=1,
            request_retry_backoff_seconds=0.01,
        )

    def test_retry_success_uses_per_attempt_timing(self):
        payload = {
            "usage": {"prompt_tokens": 5, "completion_tokens": 4, "total_tokens": 9},
            "choices": [{"delta": {"content": "abcd"}, "finish_reason": None}],
        }
        response = FakeResponse(
            status_code=200,
            lines=[f"data: {json.dumps(payload)}", "data: [DONE]"],
        )

        with (
            patch.object(
                monitor.requests,
                "post",
                side_effect=[requests.RequestException("first attempt timeout"), response],
            ),
            patch.object(monitor.time, "sleep", return_value=None),
            patch.object(monitor.time, "monotonic", side_effect=[0.0, 1.0, 10.0, 11.0, 12.0, 12.0, 14.0]),
            patch.object(
                monitor,
                "now_utc",
                side_effect=[
                    datetime(2026, 2, 21, 0, 0, tzinfo=timezone.utc),
                    datetime(2026, 2, 21, 0, 1, tzinfo=timezone.utc),
                    datetime(2026, 2, 21, 0, 2, tzinfo=timezone.utc),
                    datetime(2026, 2, 21, 0, 3, tzinfo=timezone.utc),
                    datetime(2026, 2, 21, 0, 4, tzinfo=timezone.utc),
                    datetime(2026, 2, 21, 0, 5, tzinfo=timezone.utc),
                    datetime(2026, 2, 21, 0, 6, tzinfo=timezone.utc),
                ],
            ),
        ):
            result = monitor.stream_chat_completion(self.cfg, "hello", "req-1")

        self.assertTrue(result["ok"])
        self.assertEqual(result["attempt"], 2)
        self.assertAlmostEqual(result["header_latency_ms"], 1000.0)
        self.assertAlmostEqual(result["first_sse_event_ms"], 2000.0)
        self.assertAlmostEqual(result["ttft_ms"], 2000.0)
        self.assertAlmostEqual(result["total_latency_ms"], 4000.0)
        self.assertAlmostEqual(result["generation_window_ms"], 2000.0)
        self.assertAlmostEqual(result["output_tokens_per_second"], 2.0)
        self.assertAlmostEqual(result["output_tokens_per_second_end_to_end"], 1.0)
        self.assertEqual(result["sse_event_count"], 1)
        self.assertEqual(result["content_chunk_count"], 1)

    def test_generation_window_waits_for_stream_end_not_finish_reason(self):
        first_event = {
            "choices": [{"delta": {"content": "token"}, "finish_reason": None}],
        }
        finish_reason_event = {
            "usage": {"prompt_tokens": 8, "completion_tokens": 8, "total_tokens": 16},
            "choices": [{"delta": {}, "finish_reason": "stop"}],
        }
        response = FakeResponse(
            status_code=200,
            lines=[
                f"data: {json.dumps(first_event)}",
                f"data: {json.dumps(finish_reason_event)}",
                "data: [DONE]",
            ],
        )

        with (
            patch.object(monitor.requests, "post", return_value=response),
            patch.object(monitor.time, "monotonic", side_effect=[19.0, 20.0, 21.0, 22.0, 22.0, 26.0]),
            patch.object(
                monitor,
                "now_utc",
                side_effect=[
                    datetime(2026, 2, 21, 0, 0, tzinfo=timezone.utc),
                    datetime(2026, 2, 21, 0, 1, tzinfo=timezone.utc),
                    datetime(2026, 2, 21, 0, 2, tzinfo=timezone.utc),
                    datetime(2026, 2, 21, 0, 3, tzinfo=timezone.utc),
                    datetime(2026, 2, 21, 0, 4, tzinfo=timezone.utc),
                ],
            ),
        ):
            result = monitor.stream_chat_completion(self.cfg, "hello", "req-2")

        self.assertTrue(result["ok"])
        self.assertAlmostEqual(result["first_sse_event_ms"], 2000.0)
        self.assertAlmostEqual(result["ttft_ms"], 2000.0)
        self.assertAlmostEqual(result["generation_window_ms"], 4000.0)
        self.assertAlmostEqual(result["output_tokens_per_second"], 2.0)
        self.assertAlmostEqual(result["output_tokens_per_second_end_to_end"], 1.3333333333)
        self.assertEqual(result["sse_event_count"], 2)
        self.assertEqual(result["content_chunk_count"], 1)


if __name__ == "__main__":
    unittest.main()
