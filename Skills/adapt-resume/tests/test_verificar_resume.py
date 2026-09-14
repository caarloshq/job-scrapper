import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verificar_resume import restricoes_candidatura, contem_termo, contar_travessoes
class Restricoes(unittest.TestCase):
    def test_travessao_e_meia_risca(self):
        self.assertEqual(contar_travessoes("2023 – 2026 — título"), 2)
        self.assertEqual(contar_travessoes("2023 a 2026 - título"), 0)
    def test_nunca_citar_vem_da_pessoa(self):
        dados = {"nunca_citar": [r"27[,.]7\s*%", r"Advanced|Fluent"]}
        self.assertTrue(restricoes_candidatura("Onboarding 27,7%", dados))
        self.assertTrue(restricoes_candidatura("English (Advanced)", dados))
        self.assertFalse(restricoes_candidatura("English (B2)", dados))
    def test_sem_lista_nada_e_proibido(self):
        self.assertFalse(restricoes_candidatura("Onboarding 27,7%", {}))
        self.assertFalse(restricoes_candidatura("Onboarding 27,7%"))
    def test_nao_confunde_ia_com_substring(self):
        self.assertFalse(contem_termo("materiais", "ia"))
        self.assertFalse(contem_termo("email", "ai"))
        self.assertTrue(contem_termo("design com ia", "ia"))
if __name__ == "__main__": unittest.main()
