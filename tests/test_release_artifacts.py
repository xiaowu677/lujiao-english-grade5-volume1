import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "tools" / "build_grade5.py"


class ReleaseArtifactsTest(unittest.TestCase):
    def test_committed_pages_match_a_fresh_build(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_root = Path(temp_dir)
            subprocess.run(
                [
                    "python",
                    str(BUILDER),
                    "--output-root",
                    str(output_root),
                ],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )

            paths = ["index.html"] + [
                f"outputs/v2.1-unit{number}/index.html"
                for number in range(1, 8)
            ]
            for relative_path in paths:
                self.assertEqual(
                    (output_root / relative_path).read_bytes(),
                    (ROOT / relative_path).read_bytes(),
                    relative_path,
                )


if __name__ == "__main__":
    unittest.main()
