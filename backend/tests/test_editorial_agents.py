"""Unit tests for the deterministic editorial agents.

Every agent in ``app.agents.editorial_agents`` is a pure function, so
CI can pin behaviour with lightweight in-memory fixtures.
"""
from app.agents.editorial_agents import (
    run_cross_round_consistency_agent,
    run_duplicate_submission_agent,
    run_panel_balance_agent,
    run_reviewer_bias_agent,
)


def test_duplicate_agent_flags_identical_title_same_author():
    r = run_duplicate_submission_agent(
        submission_id="s1",
        title="Machine Learning for Water Quality",
        author_name="Ada Lovelace",
        author_email="ada@example.com",
        other_submissions=[{
            "id": "s2",
            "paper_title": "Machine Learning for Water Quality",
            "author_name": "Ada Lovelace",
            "author_email": "ada@example.com",
        }],
    )
    assert r.is_duplicate is True
    assert any("Identical title" in h.reason for h in r.hits)


def test_duplicate_agent_ignores_different_paper():
    r = run_duplicate_submission_agent(
        submission_id="s1",
        title="Machine Learning for Water Quality",
        author_name="Ada Lovelace",
        author_email="ada@example.com",
        other_submissions=[{
            "id": "s2",
            "paper_title": "Vibration Analysis of Bridges",
            "author_name": "Grace Hopper",
            "author_email": "grace@example.com",
        }],
    )
    assert r.is_duplicate is False


def test_reviewer_bias_hard_when_reviewer_is_author():
    v = run_reviewer_bias_agent(
        reviewer_email="ada@example.com",
        reviewer_institution="MIT",
        author_emails=["ada@example.com"],
        author_institutions=["MIT"],
    )
    assert v.is_conflict is True
    assert v.severity == "hard"


def test_reviewer_bias_soft_when_same_institution():
    v = run_reviewer_bias_agent(
        reviewer_email="reviewer@othersite.edu",
        reviewer_institution="MIT",
        author_emails=["ada@example.com"],
        author_institutions=["MIT"],
    )
    assert v.is_conflict is True
    assert v.severity == "soft"


def test_reviewer_bias_clear_for_unrelated():
    v = run_reviewer_bias_agent(
        reviewer_email="reviewer@othersite.edu",
        reviewer_institution="Cambridge",
        author_emails=["ada@example.com"],
        author_institutions=["MIT"],
    )
    assert v.is_conflict is False
    assert v.severity == "clear"


def test_panel_balance_warns_on_single_country_dominance():
    r = run_panel_balance_agent(reviewers=[
        {"country": "US", "institution": "MIT",       "email": "a@mit.edu"},
        {"country": "US", "institution": "Stanford",  "email": "b@stanford.edu"},
        {"country": "US", "institution": "Berkeley",  "email": "c@berkeley.edu"},
    ])
    assert r.ok is False
    assert any("single country" in w for w in r.warnings)


def test_panel_balance_ok_when_diverse():
    r = run_panel_balance_agent(reviewers=[
        {"country": "US", "institution": "MIT",       "email": "a@mit.edu"},
        {"country": "UK", "institution": "Cambridge", "email": "b@cam.ac.uk"},
        {"country": "IN", "institution": "IIT-B",     "email": "c@iitb.ac.in"},
    ])
    assert r.ok is True


def test_cross_round_repeats_flagged():
    r = run_cross_round_consistency_agent(
        previous_round_comments=[
            "The dataset splitting methodology needs clarification and justification for the ratio."
        ],
        current_round_comments=[
            "Dataset splitting methodology still needs clarification and justification for the training ratio.",
        ],
    )
    assert r.ok is False
    assert len(r.repeated_concerns) == 1


def test_cross_round_no_repeats_when_fresh():
    r = run_cross_round_consistency_agent(
        previous_round_comments=["Reference formatting must be corrected."],
        current_round_comments=["The discussion section could be expanded."],
    )
    assert r.ok is True
