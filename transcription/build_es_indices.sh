ES_HOST="https://search-voice-analytics-ni6lxteputeccf5fbsmaxlljwu.ap-southeast-2.es.amazonaws.com"

echo Creating index...
curl -X PUT $ES_HOST/audioarchive/ -H 'Content-Type: application/json' -d '{
    "settings" : {
        "index" : {
            "number_of_shards" : 1, 
            "number_of_replicas" : 0
        }
    }
}'
echo
echo Creating doctype...
curl -X PUT $ES_HOST/audioarchive/recording/_mapping -H 'Content-Type: application/json' -d '{
    "recording" : {
        "properties" : {
            "recordingId": { "type" : "text" },
            "transcript": { "type" : "text" },
            "created": { "type" : "date" },
            "Sentiment": { "type" : "text" },
            "KeyPhrases": { "type" : "object" },
            "Entities": { "type" : "object" },
            "Positive": { "type" : "float" },
            "Negative": { "type" : "float" },
            "Neutral": { "type" : "float" }
        }
	}
}'
