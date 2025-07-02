"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bayesianUpdateConfidence = bayesianUpdateConfidence;
exports.calculateInformationGain = calculateInformationGain;
exports.calculateEntropy = calculateEntropy;
exports.calculateMutualInformation = calculateMutualInformation;
exports.performStatisticalTest = performStatisticalTest;
exports.calculateMean = calculateMean;
exports.calculateVariance = calculateVariance;
exports.calculateStandardDeviation = calculateStandardDeviation;
exports.calculateCorrelation = calculateCorrelation;
exports.calculateProportionConfidenceInterval = calculateProportionConfidenceInterval;
exports.calculateCohenD = calculateCohenD;
/**
 * Performs proper Bayesian update using evidence likelihood
 */
function bayesianUpdateConfidence(priorConfidence, evidenceStrength, supportsHypothesis, evidenceType = 'empirical', sampleSize = 1) {
    // Validate inputs
    if (evidenceStrength < 0 || evidenceStrength > 1) {
        throw new Error('Evidence strength must be between 0 and 1');
    }
    // Convert confidence to probabilities (map from [0,1] to (0,1) to avoid division by zero)
    const priorProb = Math.max(0.001, Math.min(0.999, priorConfidence.empirical_support));
    const priorOdds = priorProb / (1 - priorProb);
    // Calculate likelihood ratio based on evidence
    const likelihoodRatio = calculateLikelihoodRatio(evidenceStrength, supportsHypothesis, evidenceType, sampleSize);
    // Apply Bayes' theorem: P(H|E) = P(E|H) * P(H) / P(E)
    const posteriorOdds = priorOdds * likelihoodRatio;
    const posteriorProb = posteriorOdds / (1 + posteriorOdds);
    // Calculate log likelihood for information gain
    const logLikelihood = Math.log(likelihoodRatio);
    // Update all confidence dimensions
    const updatedConfidence = {
        empirical_support: posteriorProb,
        theoretical_basis: updateTheoriticalBasis(priorConfidence.theoretical_basis, evidenceStrength, evidenceType),
        methodological_rigor: updateMethodologicalRigor(priorConfidence.methodological_rigor, evidenceStrength, sampleSize),
        consensus_alignment: updateConsensusAlignment(priorConfidence.consensus_alignment, evidenceStrength, supportsHypothesis)
    };
    // Calculate information gain using KL divergence
    const informationGain = calculateKLDivergence(priorProb, posteriorProb);
    return {
        updatedConfidence,
        logLikelihood,
        posteriorOdds,
        informationGain
    };
}
/**
 * Calculates likelihood ratio for different types of evidence
 */
function calculateLikelihoodRatio(evidenceStrength, supportsHypothesis, evidenceType, sampleSize) {
    let baseRatio;
    // Different evidence types have different reliability
    switch (evidenceType.toLowerCase()) {
        case 'experimental':
            baseRatio = 2 + evidenceStrength * 8; // Range: 2-10
            break;
        case 'observational':
            baseRatio = 1.5 + evidenceStrength * 4; // Range: 1.5-5.5
            break;
        case 'theoretical':
            baseRatio = 1.2 + evidenceStrength * 2; // Range: 1.2-3.2
            break;
        case 'expert_opinion':
            baseRatio = 1.1 + evidenceStrength * 1.5; // Range: 1.1-2.6
            break;
        default: // 'empirical'
            baseRatio = 1.5 + evidenceStrength * 3; // Range: 1.5-4.5
    }
    // Adjust for sample size (larger samples = more reliable)
    const sampleAdjustment = Math.log(sampleSize + 1) / Math.log(10); // Log base 10
    baseRatio *= (1 + sampleAdjustment * 0.2);
    // Invert ratio if evidence contradicts hypothesis
    return supportsHypothesis ? baseRatio : 1 / baseRatio;
}
/**
 * Updates theoretical basis component
 */
function updateTheoriticalBasis(prior, evidenceStrength, evidenceType) {
    const weight = evidenceType === 'theoretical' ? 0.3 : 0.1;
    const update = evidenceStrength * weight;
    return Math.max(0, Math.min(1, prior + update));
}
/**
 * Updates methodological rigor component
 */
function updateMethodologicalRigor(prior, evidenceStrength, sampleSize) {
    // Larger samples indicate better methodology
    const methodologyScore = Math.min(1, Math.log(sampleSize + 1) / Math.log(1000));
    const update = evidenceStrength * methodologyScore * 0.2;
    return Math.max(0, Math.min(1, prior + update));
}
/**
 * Updates consensus alignment component
 */
function updateConsensusAlignment(prior, evidenceStrength, supportsHypothesis) {
    const weight = 0.15;
    const update = supportsHypothesis ? evidenceStrength * weight : -evidenceStrength * weight;
    return Math.max(0, Math.min(1, prior + update));
}
/**
 * Calculates KL divergence for information gain
 */
function calculateKLDivergence(p, q) {
    if (p === 0 || q === 0)
        return 0;
    return p * Math.log2(p / q) + (1 - p) * Math.log2((1 - p) / (1 - q));
}
/**
 * Calculates information gain using entropy
 */
function calculateInformationGain(priorDistribution, posteriorDistribution) {
    if (priorDistribution.length !== posteriorDistribution.length) {
        throw new Error('Prior and posterior distributions must have the same length');
    }
    const priorEntropy = calculateEntropy(priorDistribution);
    const posteriorEntropy = calculateEntropy(posteriorDistribution);
    return priorEntropy - posteriorEntropy;
}
/**
 * Calculates Shannon entropy
 */
function calculateEntropy(distribution) {
    const sum = distribution.reduce((a, b) => a + b, 0);
    if (sum === 0)
        return 0;
    const normalizedDist = distribution.map(p => p / sum);
    return -normalizedDist.reduce((entropy, p) => {
        return p > 0 ? entropy + p * Math.log2(p) : entropy;
    }, 0);
}
/**
 * Calculates mutual information between two variables
 */
function calculateMutualInformation(jointDistribution, marginalX, marginalY) {
    let mutualInfo = 0;
    for (let i = 0; i < jointDistribution.length; i++) {
        for (let j = 0; j < jointDistribution[i].length; j++) {
            const pxy = jointDistribution[i][j];
            const px = marginalX[i];
            const py = marginalY[j];
            if (pxy > 0 && px > 0 && py > 0) {
                mutualInfo += pxy * Math.log2(pxy / (px * py));
            }
        }
    }
    return mutualInfo;
}
/**
 * Performs statistical significance testing
 */
function performStatisticalTest(data1, data2, testType = 'ttest') {
    switch (testType) {
        case 'ttest':
            return performTTest(data1, data2);
        case 'chisquare':
            return performChiSquareTest(data1, data2);
        case 'correlation':
            return performCorrelationTest(data1, data2);
        default:
            throw new Error(`Unknown test type: ${testType}`);
    }
}
/**
 * Performs independent samples t-test
 */
function performTTest(sample1, sample2) {
    const n1 = sample1.length;
    const n2 = sample2.length;
    if (n1 < 2 || n2 < 2) {
        throw new Error('Each sample must have at least 2 observations');
    }
    const mean1 = calculateMean(sample1);
    const mean2 = calculateMean(sample2);
    const var1 = calculateVariance(sample1);
    const var2 = calculateVariance(sample2);
    // Pooled variance
    const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
    const standardError = Math.sqrt(pooledVar * (1 / n1 + 1 / n2));
    const testStatistic = (mean1 - mean2) / standardError;
    const degreesOfFreedom = n1 + n2 - 2;
    // Approximate p-value using normal distribution for large samples
    const pValue = 2 * (1 - normalCDF(Math.abs(testStatistic)));
    // 95% confidence interval
    const marginOfError = 1.96 * standardError; // Using normal approximation
    const confidenceInterval = [
        (mean1 - mean2) - marginOfError,
        (mean1 - mean2) + marginOfError
    ];
    // Cohen's d effect size
    const effectSize = (mean1 - mean2) / Math.sqrt(pooledVar);
    // Power analysis (simplified)
    const powerAnalysis = calculateStatisticalPower(effectSize, n1, n2);
    return {
        testStatistic,
        pValue,
        confidenceInterval,
        effectSize,
        powerAnalysis
    };
}
/**
 * Performs chi-square test
 */
function performChiSquareTest(observed, expected) {
    if (observed.length !== expected.length) {
        throw new Error('Observed and expected arrays must have the same length');
    }
    let chiSquare = 0;
    for (let i = 0; i < observed.length; i++) {
        if (expected[i] > 0) {
            chiSquare += Math.pow(observed[i] - expected[i], 2) / expected[i];
        }
    }
    const degreesOfFreedom = observed.length - 1;
    const pValue = 1 - chiSquareCDF(chiSquare, degreesOfFreedom);
    // Effect size (Cramér's V approximation)
    const n = observed.reduce((sum, val) => sum + val, 0);
    const effectSize = Math.sqrt(chiSquare / (n * (Math.min(observed.length, 2) - 1)));
    return {
        testStatistic: chiSquare,
        pValue,
        confidenceInterval: [0, 0], // Not applicable for chi-square
        effectSize,
        powerAnalysis: 0.8 // Placeholder
    };
}
/**
 * Performs correlation test
 */
function performCorrelationTest(x, y) {
    if (x.length !== y.length) {
        throw new Error('Arrays must have the same length');
    }
    const n = x.length;
    if (n < 3) {
        throw new Error('Need at least 3 data points for correlation');
    }
    const correlation = calculateCorrelation(x, y);
    // t-statistic for correlation
    const testStatistic = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
    // Approximate p-value
    const pValue = 2 * (1 - normalCDF(Math.abs(testStatistic)));
    // Fisher's z-transformation for confidence interval
    const zr = 0.5 * Math.log((1 + correlation) / (1 - correlation));
    const se = 1 / Math.sqrt(n - 3);
    const zLower = zr - 1.96 * se;
    const zUpper = zr + 1.96 * se;
    const confidenceInterval = [
        (Math.exp(2 * zLower) - 1) / (Math.exp(2 * zLower) + 1),
        (Math.exp(2 * zUpper) - 1) / (Math.exp(2 * zUpper) + 1)
    ];
    return {
        testStatistic: correlation,
        pValue,
        confidenceInterval,
        effectSize: Math.abs(correlation),
        powerAnalysis: 0.8 // Placeholder
    };
}
/**
 * Helper mathematical functions
 */
function calculateMean(data) {
    return data.reduce((sum, val) => sum + val, 0) / data.length;
}
function calculateVariance(data) {
    const mean = calculateMean(data);
    return data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (data.length - 1);
}
function calculateStandardDeviation(data) {
    return Math.sqrt(calculateVariance(data));
}
function calculateCorrelation(x, y) {
    const n = x.length;
    const meanX = calculateMean(x);
    const meanY = calculateMean(y);
    let numerator = 0;
    let sumXSquared = 0;
    let sumYSquared = 0;
    for (let i = 0; i < n; i++) {
        const xDiff = x[i] - meanX;
        const yDiff = y[i] - meanY;
        numerator += xDiff * yDiff;
        sumXSquared += xDiff * xDiff;
        sumYSquared += yDiff * yDiff;
    }
    const denominator = Math.sqrt(sumXSquared * sumYSquared);
    return denominator === 0 ? 0 : numerator / denominator;
}
/**
 * Approximates normal CDF using error function
 */
function normalCDF(z) {
    return 0.5 * (1 + erf(z / Math.sqrt(2)));
}
/**
 * Error function approximation
 */
function erf(x) {
    // Abramowitz and Stegun approximation
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
}
/**
 * Chi-square CDF approximation
 */
function chiSquareCDF(x, df) {
    if (x <= 0)
        return 0;
    if (df === 1)
        return 2 * normalCDF(Math.sqrt(x)) - 1;
    if (df === 2)
        return 1 - Math.exp(-x / 2);
    // Wilson-Hilferty approximation for larger df
    const h = 2 / (9 * df);
    const z = (Math.pow(x / df, 1 / 3) - 1 + h) / Math.sqrt(h);
    return normalCDF(z);
}
/**
 * Statistical power calculation
 */
function calculateStatisticalPower(effectSize, n1, n2, alpha = 0.05) {
    // Simplified power calculation for t-test
    const nHarmonic = 2 / (1 / n1 + 1 / n2);
    const delta = effectSize * Math.sqrt(nHarmonic / 2);
    const criticalValue = 1.96; // For alpha = 0.05
    return 1 - normalCDF(criticalValue - delta) + normalCDF(-criticalValue - delta);
}
/**
 * Calculates confidence interval for proportion
 */
function calculateProportionConfidenceInterval(successes, total, confidenceLevel = 0.95) {
    const p = successes / total;
    const z = confidenceLevel === 0.95 ? 1.96 : 2.576; // 95% or 99%
    const margin = z * Math.sqrt(p * (1 - p) / total);
    return [
        Math.max(0, p - margin),
        Math.min(1, p + margin)
    ];
}
/**
 * Calculates effect size (Cohen's d) between two groups
 */
function calculateCohenD(group1, group2) {
    const mean1 = calculateMean(group1);
    const mean2 = calculateMean(group2);
    const var1 = calculateVariance(group1);
    const var2 = calculateVariance(group2);
    const pooledSD = Math.sqrt(((group1.length - 1) * var1 + (group2.length - 1) * var2) /
        (group1.length + group2.length - 2));
    return (mean1 - mean2) / pooledSD;
}
