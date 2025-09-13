use risc0_zkvm::guest::env;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Read;

#[derive(Serialize, Deserialize, Debug)]
struct Keyword {
    word: String,
    count: u32,
}

#[derive(Serialize, Deserialize, Debug)]
struct JournalOutput {
    #[serde(rename = "programHash")]
    program_hash: String,
    #[serde(rename = "inputHash")]
    input_hash: String,
    #[serde(rename = "outputHash")]
    output_hash: String,
    keywords: Vec<Keyword>,
}

// Common English stopwords
const STOPWORDS: &[&str] = &[
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
    "to", "was", "will", "with", "i", "you", "we", "they", "this",
    "but", "not", "or", "have", "had", "can", "could", "would", "should",
    "may", "might", "must", "shall", "do", "does", "did", "been", "being",
    "am", "were", "his", "her", "him", "she", "my", "your", "our", "their"
];

fn main() {
    // Read input text from stdin
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("Failed to read input");
    
    // Compute input hash
    let input_hash = format!("{:x}", Sha256::digest(input.as_bytes()));
    
    // Process text: lowercase and split on non-alphabetic characters
    let text = input.to_lowercase();
    let words: Vec<&str> = text
        .split(|c: char| !c.is_ascii_lowercase())
        .filter(|word| !word.is_empty() && !STOPWORDS.contains(word))
        .collect();
    
    // Count word frequencies
    let mut word_counts: HashMap<String, u32> = HashMap::new();
    for word in words {
        *word_counts.entry(word.to_string()).or_insert(0) += 1;
    }
    
    // Sort by (-count, word) and take top 5
    let mut sorted_words: Vec<(String, u32)> = word_counts.into_iter().collect();
    sorted_words.sort_by(|a, b| {
        // Sort by count descending, then by word ascending
        b.1.cmp(&a.1).then(a.0.cmp(&b.0))
    });
    
    // Take top 5 keywords
    let keywords: Vec<Keyword> = sorted_words
        .into_iter()
        .take(5)
        .map(|(word, count)| Keyword { word, count })
        .collect();
    
    // Compute output hash from canonical JSON of keywords
    let keywords_json = serde_json::to_string(&keywords).expect("Failed to serialize keywords");
    let output_hash = format!("{:x}", Sha256::digest(keywords_json.as_bytes()));
    
    // Create journal output with placeholder program hash
    let journal = JournalOutput {
        program_hash: "<PLACEHOLDER>".to_string(),
        input_hash,
        output_hash,
        keywords,
    };
    
    // Commit the journal to the zkVM
    env::commit(&journal);
}