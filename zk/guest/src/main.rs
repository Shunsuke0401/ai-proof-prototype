#![no_main]

use risc0_zkvm::guest::env;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

// Embedded stopwords list for deterministic filtering
const STOPWORDS: &str = include_str!("stopwords.txt");

#[derive(Serialize, Deserialize, Debug, Clone)]
struct Keyword {
    word: String,
    count: u32,
}

#[derive(Serialize, Deserialize, Debug)]
struct Journal {
    #[serde(rename = "programHash")]
    program_hash: String,
    #[serde(rename = "inputHash")]
    input_hash: String,
    #[serde(rename = "outputHash")]
    output_hash: String,
    keywords: Vec<Keyword>,
}

fn normalize_text(input: &str) -> Vec<String> {
    // Load stopwords into a set for fast lookup
    let stopwords: std::collections::HashSet<&str> = STOPWORDS
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect();
    
    // Normalize: lowercase, split on non-alphabetic, filter stopwords and empty
    input
        .to_lowercase()
        .split(|c: char| !c.is_ascii_alphabetic())
        .filter(|word| !word.is_empty() && !stopwords.contains(word))
        .map(|word| word.to_string())
        .collect()
}

fn canonical_json<T: Serialize>(value: &T) -> String {
    // Produce canonical JSON with sorted keys and no extra whitespace
    serde_json::to_string(value).unwrap()
}

risc0_zkvm::guest::entry!(main);

fn main() {
    // Read full UTF-8 input from stdin via zkVM environment
    let input_bytes: Vec<u8> = env::read();
    let input = String::from_utf8(input_bytes.clone()).expect("Invalid UTF-8 input");
    
    // Normalize and count word frequencies
    let words = normalize_text(&input);
    let mut word_counts = HashMap::new();
    for word in words {
        *word_counts.entry(word).or_insert(0u32) += 1;
    }
    
    // Sort deterministically: by (-count, word) for stable ordering
    let mut keywords_vec: Vec<_> = word_counts.into_iter().collect();
    keywords_vec.sort_by(|a, b| {
        // Sort by count descending, then by word ascending
        b.1.cmp(&a.1).then(a.0.cmp(&b.0))
    });
    
    // Take top K=5 keywords
    let top_keywords: Vec<Keyword> = keywords_vec
        .into_iter()
        .take(5)
        .map(|(word, count)| Keyword { word, count })
        .collect();
    
    // Compute hashes
    let input_hash = format!("sha256:{}", hex::encode(Sha256::digest(&input_bytes)));
    let keywords_canonical = canonical_json(&top_keywords);
    let output_hash = format!("sha256:{}", hex::encode(Sha256::digest(keywords_canonical.as_bytes())));
    
    // Create journal with placeholder for programHash (filled by host)
    let journal = Journal {
        program_hash: "<FILLED_BY_HOST>".to_string(),
        input_hash,
        output_hash,
        keywords: top_keywords,
    };
    
    // Commit the journal as JSON bytes to the zkVM
    let journal_json = canonical_json(&journal);
    env::commit_slice(journal_json.as_bytes());
}