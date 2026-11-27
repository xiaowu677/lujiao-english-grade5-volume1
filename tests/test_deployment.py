import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DeploymentTest(unittest.TestCase):
    def test_pages_workflow_stages_the_complete_grade_five_site(self):
        workflow = (ROOT / ".github" / "workflows" / "pages.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("outputs/v2.1-*", workflow)
        self.assertIn("enablement: true", workflow)
        self.assertIn("outputs/assets/audio/v2.1/en-GB-SoniaNeural", workflow)
        self.assertIn("find _site -name index.html", workflow)
        self.assertIn('"$(find _site -name index.html | wc -l)" -eq 8', workflow)
        self.assertIn("find _site/outputs/assets/audio/v2.1", workflow)
        self.assertIn("-name '*.mp3'", workflow)
        self.assertIn('"$(find _site/outputs/assets/audio/v2.1 -name \'*.mp3\' | wc -l)" -eq 493', workflow)

    def test_readme_documents_all_units_and_audio_size(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("155", readme)
        self.assertIn("493", readme)
        for number in range(1, 8):
            self.assertIn(f"outputs/v2.1-unit{number}/index.html", readme)


if __name__ == "__main__":
    unittest.main()
