"""Pipeline de churn ML: treino → salvar → inferência → fallback heurístico."""
import pytest


def test_pipeline_treina_e_infere(tmp_path):
    pytest.importorskip("sklearn")
    from ml.train import _synthetic, train
    from ml import inference

    model_path = tmp_path / "model.joblib"
    res = train(_synthetic(800), str(model_path))
    assert res["n"] == 800
    assert model_path.exists()

    # força a inferência a usar este modelo
    inference._MODEL_PATH = str(model_path)
    inference._loaded = False
    inference._model = None

    out = inference.assess_churn_risk(recency_days=50, avg_interval_days=15.0, frequency=12)
    assert out["risk"] in ("none", "low", "medium", "high")
    assert out.get("source") == "model"  # veio do modelo, não da heurística


def test_fallback_heuristico_sem_modelo():
    from ml import inference

    inference._MODEL_PATH = "/caminho/inexistente/model.joblib"
    inference._loaded = False
    inference._model = None

    # ratio 1.75 → heurística retorna "high" (sem chave 'source')
    out = inference.assess_churn_risk(recency_days=35, avg_interval_days=20.0, frequency=6)
    assert out["risk"] == "high"
    assert "source" not in out


def test_guardas_preservadas():
    from ml import inference

    inference._MODEL_PATH = "/caminho/inexistente/model.joblib"
    inference._loaded = False
    inference._model = None
    # histórico insuficiente e já-churned continuam "none"
    assert inference.assess_churn_risk(40, 20.0, 2)["risk"] == "none"
    assert inference.assess_churn_risk(90, 20.0, 6)["risk"] == "none"
