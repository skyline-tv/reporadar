'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import {
  Box,
  Container,
  Heading,
  Text,
  Spinner,
  Alert,
  AlertIcon,
  AlertDescription,
  AlertTitle,
  VStack,
  HStack,
  useToast,
  Badge,
  Button,
  Link,
  useDisclosure,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  Flex,
  Progress,
} from '@chakra-ui/react';
import { FiLogOut, FiRefreshCw, FiGithub, FiMessageCircle, FiClock } from 'react-icons/fi';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import AppNav from '../components/AppNav';
import ReportViewer from '../components/ReportViewer';

const LOADING_STEPS = [
  'Cloning the repository…',
  'Inspecting project structure…',
  'Sampling source files…',
  'Generating the analysis report…',
];

function AnalysisPage() {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [repoName, setRepoName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      localStorage.setItem('lastAction', 'analysis');
      router.push('/login');
      return;
    }

    const existingId = searchParams.get('id');

    const loadExistingAnalysis = async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(apiUrl(`/analysis/${id}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
          return;
        }
        if (!response.ok) throw new Error(payload.message || 'Failed to load saved analysis');

        const detail = payload.data;
        setAnalysisId(detail.id);
        setRepoName(`${detail.owner}/${detail.repo}`);
        setRepoUrl(detail.repoUrl || '');
        localStorage.setItem('analyzedRepo', detail.repoUrl || '');

        if (detail.status === 'failed') {
          setError(detail.error || 'This analysis failed.');
          setReport(null);
          return;
        }
        if (detail.status !== 'completed' || !detail.report) {
          setError(`Analysis is ${detail.status}. Check history and try again shortly.`);
          setReport(null);
          return;
        }
        setReport(detail.report);
      } catch (e: any) {
        setError(e.message || 'Failed to load saved analysis');
        setReport(null);
      } finally {
        setLoading(false);
      }
    };

    const runNewAnalysis = async () => {
      const analyzedRepo = localStorage.getItem('analyzedRepo');
      if (!analyzedRepo) {
        setError('No repository selected. Choose a repo from the dashboard.');
        setLoading(false);
        return;
      }

      try {
        setRepoName(analyzedRepo.split('/').slice(-2).join('/'));
        setRepoUrl(analyzedRepo);
        setLoading(true);
        setError(null);

        const response = await fetch(apiUrl('/analysis/repository'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ repoUrl: analyzedRepo }),
        });

        const analysisResult = await response.json().catch(() => ({}));
        if (response.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
          return;
        }
        if (response.status === 409 && analysisResult.data?.analysisId) {
          router.replace(`/analysis?id=${analysisResult.data.analysisId}`);
          return;
        }
        if (!response.ok) {
          if (analysisResult.data?.analysisId) setAnalysisId(analysisResult.data.analysisId);
          throw new Error(analysisResult.message || 'Analysis failed');
        }

        const reportContent =
          analysisResult.data?.report ||
          analysisResult.report ||
          JSON.stringify(analysisResult, null, 2);
        setReport(reportContent);
        if (analysisResult.data?.analysisId) {
          setAnalysisId(analysisResult.data.analysisId);
          router.replace(`/analysis?id=${analysisResult.data.analysisId}`);
        }
      } catch (e: any) {
        setError(e.message || 'Failed to analyze repository');
      } finally {
        setLoading(false);
      }
    };

    if (existingId) loadExistingAnalysis(existingId);
    else runNewAnalysis();
  }, [router, searchParams]);

  useEffect(() => {
    if (!loading || searchParams.get('id')) return;
    setLoadingStep(0);
    const timer = window.setInterval(() => {
      setLoadingStep((step) => (step < LOADING_STEPS.length - 1 ? step + 1 : step));
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loading, searchParams]);

  const handleLogout = () => {
    localStorage.clear();
    toast({ title: 'Logged out', status: 'success', duration: 2500, isClosable: true });
    router.push('/');
  };

  if (loading) {
    const isSavedLoad = Boolean(searchParams.get('id'));
    return (
      <Box minH="100vh" bg="surface.500">
        <AppNav />
        <Flex minH="70vh" align="center" justify="center" px={4}>
          <VStack
            spacing={4}
            p={8}
            borderWidth="1px"
            borderColor="whiteAlpha.200"
            borderRadius="lg"
            bg="surface.200"
            maxW="md"
            w="full"
          >
            <Spinner size="xl" color="brand.400" thickness="3px" />
            <Text fontWeight="600" textAlign="center">
              {isSavedLoad ? 'Loading saved report…' : 'Analyzing repository…'}
            </Text>
            {repoName && (
              <Badge colorScheme="teal" variant="subtle">
                {repoName}
              </Badge>
            )}
            <Text fontSize="sm" color="gray.400" textAlign="center">
              {isSavedLoad
                ? 'Fetching your stored analysis from history.'
                : LOADING_STEPS[loadingStep]}
            </Text>
            {!isSavedLoad && (
              <>
                <Progress
                  size="sm"
                  isIndeterminate
                  colorScheme="teal"
                  w="full"
                  borderRadius="full"
                />
                <Text fontSize="xs" color="gray.500" textAlign="center">
                  First-time analysis can take 1–3 minutes depending on repo size and network.
                </Text>
              </>
            )}
          </VStack>
        </Flex>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg="surface.500">
      <AppNav />
      <Container maxW="container.xl" py={{ base: 4, md: 8 }}>
        <VStack align="stretch" spacing={5}>
          <Flex
            justify="space-between"
            align={{ base: 'stretch', md: 'center' }}
            gap={3}
            direction={{ base: 'column', md: 'row' }}
          >
            <Box>
              <HStack mb={1} flexWrap="wrap">
                <Heading size="md">Analysis report</Heading>
                {repoName && (
                  <Badge colorScheme="teal" variant="subtle">
                    {repoName}
                  </Badge>
                )}
                {analysisId && (
                  <Badge variant="outline" colorScheme="gray">
                    Saved
                  </Badge>
                )}
              </HStack>
              <Text fontSize="sm" color="gray.400">
                Structured findings with evidence from inspected files.
              </Text>
            </Box>
            <HStack flexWrap="wrap">
              <Button size="sm" variant="outline" leftIcon={<FiClock />} onClick={() => router.push('/history')}>
                History
              </Button>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<FiGithub />}
                as={Link}
                href={repoUrl || '#'}
                isExternal
                isDisabled={!repoUrl}
              >
                Repo
              </Button>
              <Button size="sm" variant="outline" leftIcon={<FiMessageCircle />} onClick={() => router.push('/chat')}>
                Chat
              </Button>
              <Button size="sm" variant="ghost" leftIcon={<FiRefreshCw />} onClick={() => router.push('/dashboard')}>
                New
              </Button>
              <Button size="sm" variant="ghost" colorScheme="red" leftIcon={<FiLogOut />} onClick={onOpen}>
                Log out
              </Button>
            </HStack>
          </Flex>

          <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose} isCentered>
            <AlertDialogOverlay>
              <AlertDialogContent bg="surface.200" color="white">
                <AlertDialogHeader>Log out?</AlertDialogHeader>
                <AlertDialogBody>This clears your local session data on this device.</AlertDialogBody>
                <AlertDialogFooter>
                  <Button ref={cancelRef} onClick={onClose} variant="ghost">
                    Cancel
                  </Button>
                  <Button colorScheme="red" onClick={handleLogout} ml={3}>
                    Log out
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialogOverlay>
          </AlertDialog>

          {error && (
            <Alert status="error" borderRadius="md" variant="subtle" alignItems="flex-start">
              <AlertIcon />
              <Box>
                <AlertTitle>Could not load report</AlertTitle>
                <AlertDescription display="block" mt={1}>
                  {error}
                </AlertDescription>
                <HStack pt={3} flexWrap="wrap">
                  <Button size="sm" onClick={() => router.push('/dashboard')}>
                    Dashboard
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => router.push('/history')}>
                    History
                  </Button>
                  {repoUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        localStorage.setItem('analyzedRepo', repoUrl);
                        router.replace('/analysis');
                      }}
                    >
                      Retry analysis
                    </Button>
                  )}
                </HStack>
              </Box>
            </Alert>
          )}

          {report && !error && <ReportViewer markdown={report} />}

          {!report && !error && (
            <Box
              p={8}
              textAlign="center"
              borderWidth="1px"
              borderColor="whiteAlpha.200"
              borderRadius="lg"
              bg="surface.200"
            >
              <Heading size="sm" mb={2}>
                No report available
              </Heading>
              <Text color="gray.400" mb={4}>
                Start a new analysis from the dashboard.
              </Text>
              <Button onClick={() => router.push('/dashboard')}>Go to dashboard</Button>
            </Box>
          )}
        </VStack>
      </Container>
    </Box>
  );
}

export default function AnalysisPageWrapper() {
  return (
    <Suspense
      fallback={
        <Box minH="100vh" bg="surface.500" display="flex" alignItems="center" justifyContent="center">
          <Spinner color="brand.400" size="xl" />
        </Box>
      }
    >
      <AnalysisPage />
    </Suspense>
  );
}
