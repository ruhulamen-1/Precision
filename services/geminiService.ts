import type { AnalysisResult } from "../types";

// The backend server is now expected to be running on the same origin.
// We use a relative path for the API endpoint.

// The backend server interaction has been disabled to make the app purely frontend.
async function callGeminiProxy(body: object): Promise<{ text: string }> {
  console.warn("Backend proxy call disabled:", body);
  // Return a mock response or empty object to prevent runtime errors
  return { text: JSON.stringify({ category: 'Other', priority: 'Low', summary: 'Analysis currently unavailable.' }) };
}


// Replicating the schema definition locally since we removed the @google/genai import
const responseSchema = {
    type: 'OBJECT',
    properties: {
        category: {
            type: 'STRING',
            description: "Categorize the issue into one of the following: Structural, Electrical, Plumbing, Safety Hazard, Finishing, Other.",
        },
        priority: {
            type: 'STRING',
            description: "Assess the priority of the issue. Choose one: Low, Medium, High, Critical.",
        },
        summary: {
            type: 'STRING',
            description: "Provide a concise, one-sentence summary of the issue.",
        },
    },
    required: ["category", "priority", "summary"],
};

const model = 'gemini-2.5-flash';

export const analyzeIssueDescription = async (description: string, photos: string[] = []): Promise<AnalysisResult | null> => {
    if (!description.trim()) {
        return null;
    }

    try {
        const prompt = `
            You are an expert construction site inspector. Analyze the following on-site issue report 
            and provide a structured JSON response based on the schema. Use both the text description
            and any provided images to make your assessment.
            
            Issue Description: "${description}"
        `;
        
        const textPart = { text: prompt };
        const imageParts = photos.map(photo => {
            // Remove the base64 prefix e.g., "data:image/jpeg;base64,"
            const base64Data = photo.split(',')[1];
            return {
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data
                }
            };
        });

        const parts = [textPart, ...imageParts];

        const response = await callGeminiProxy({
            model: model,
            contents: { parts: parts },
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.2,
            },
        });
        
        const jsonString = response.text;
        const result = JSON.parse(jsonString);
        
        if (result && result.category && result.priority && result.summary) {
            return result as AnalysisResult;
        }

        console.error("Parsed JSON from backend does not match expected format:", result);
        return null;

    } catch (error) {
        console.error("Error analyzing issue via backend:", error);
        return null;
    }
};

export const analyzeProjectCase = async (name: string, comments: string, photo: string): Promise<AnalysisResult | null> => {
    if (!name.trim()) {
        return null;
    }

    try {
        const fullDescription = `Case Name: ${name}\nComments: ${comments || 'N/A'}`;
        const prompt = `
            You are an expert construction project manager. Analyze the following project case report 
            and provide a structured JSON response based on the schema. Use both the text description
            (case name and comments) and the provided image to make your assessment.
            
            Case Details: "${fullDescription}"
        `;

        const textPart = { text: prompt };
        // Remove the base64 prefix e.g., "data:image/jpeg;base64,"
        const base64Data = photo.split(',')[1];
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data,
            },
        };

        const parts = [textPart, imagePart];

        const response = await callGeminiProxy({
            model: model,
            contents: { parts: parts },
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
                temperature: 0.2,
            },
        });

        const jsonString = response.text;
        const result = JSON.parse(jsonString);

        if (result && result.category && result.priority && result.summary) {
            return result as AnalysisResult;
        }

        console.error("Parsed JSON from backend does not match expected format:", result);
        return null;
    } catch (error) {
        console.error("Error analyzing project case via backend:", error);
        return null;
    }
};

export const analyzeVisitData = async (visitDataJSON: string, userQuery: string): Promise<string | null> => {
    if (!userQuery.trim()) {
        return null;
    }

    try {
        const systemInstruction = `You are a data analyst for a construction company. Your task is to analyze employee project visit data provided in JSON format and answer a user's question.
        - The data contains fields like 'date', 'visitorName', 'department', 'projectName', 'entryTime', 'outTime', and 'duration' (H:M:S format).
        - Provide a clear, concise, and professional answer based *only* on the provided data.
        - Structure your response using markdown-like formatting (e.g., use ## for headers, * for bullet points). Do not assume the output will be rendered as HTML.
        - If the data is insufficient to answer the question, state that clearly. Do not invent data.
        - Perform calculations if necessary (e.g., averages, totals, counts).`;

        const prompt = `Based on the following JSON data, please answer this question: "${userQuery}"

        Data:
        ${visitDataJSON}
        `;

        const response = await callGeminiProxy({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.3,
            },
        });

        return response.text;

    } catch (error) {
        console.error("Error analyzing visit data via backend:", error);
        return "An error occurred while contacting the backend analysis service. Please try simplifying your filters or question.";
    }
};

export const generateImprovementAnalysis = async (departmentData: string): Promise<string | null> => {
    try {
        const systemInstruction = `You are an expert HR and performance analyst for a construction company.
        Your task is to analyze the provided data for a department with declining performance and provide actionable insights.
        The data includes the department's average performance drop and details on the employees contributing most to this decline, comparing their current month's metrics to the last month's.

        Based on the data, you must provide a response structured in two parts using markdown formatting:
        1.  **Key Observations:** A concise, bulleted list identifying the primary reasons for the performance drop (e.g., reduced visit frequency, shorter visit durations, fewer projects covered).
        2.  **Actionable Recommendations:** A bulleted list of specific, constructive suggestions for management to address these issues (e.g., "Review workload of employee X," "Investigate the high number of short visits for employee Y," "Set clear daily/weekly visit targets.").

        Keep your analysis professional, data-driven, and focused on improvement. Do not be conversational. Directly provide the observations and recommendations.`;
        
        const prompt = `Please analyze the following performance data for a construction department:\n\n${departmentData}`;

        const response = await callGeminiProxy({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.4,
            },
        });

        return response.text;

    } catch (error) {
        console.error("Error generating improvement analysis via backend:", error);
        return "Error: The backend AI model could not process the performance data. This might be due to a temporary service issue or a problem with the data format. Please try again later.";
    }
};