'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Heading,
  Text,
  Input,
  Button,
  VStack,
  HStack,
  useToast,
  Flex,
  SimpleGrid,
} from '@chakra-ui/react';
import { FaSearch } from 'react-icons/fa';
import { useRouter } from 'next/navigation';
import AppNav from './components/AppNav';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import SubscriptionPlans from './components/SubscriptionPlans';
import Footer from './components/Footer';
import { DEMO_REPO_LABEL, DEMO_REPO_URL } from '@/lib/demo';

export default function Home() {
  const [repoUrl, setRepoUrl] = useState(DEMO_REPO_URL);
  const [analyzedRepo, setAnalyzedRepo] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (localStorage.getItem('token')) {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) {
      toast({ title: 'Enter a repository URL', status: 'warning', duration: 2500, isClosable: true });
      return;
    }
    const gitHubRegex = /^(https?:\/\/)?(www\.)?github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9\-._~!$&'()*+,;=:@/]+)/i;
    if (!gitHubRegex.test(repoUrl)) {
      toast({ title: 'Invalid GitHub URL', status: 'error', duration: 3000, isClosable: true });
      return;
    }
    const normalized = repoUrl.startsWith('http') ? repoUrl : `https://${repoUrl}`;
    setAnalyzedRepo(normalized);
  };

  const goAnalyze = () => {
    if (!analyzedRepo) return;
    const token = localStorage.getItem('token');
    localStorage.setItem('analyzedRepo', analyzedRepo);
    if (!token) {
      localStorage.setItem('lastAction', 'analysis');
      router.push('/login');
      return;
    }
    router.push('/analysis');
  };

  const goChat = () => {
    if (!analyzedRepo) return;
    const token = localStorage.getItem('token');
    localStorage.setItem('analyzedRepo', analyzedRepo);
    if (!token) {
      localStorage.setItem('lastAction', 'chat');
      router.push('/login');
      return;
    }
    router.push('/chat');
  };

  return (
    <Box minH="100vh" bg="surface.500">
      <AppNav />
      <Container maxW="container.lg" pt={{ base: 12, md: 20 }} pb={16}>
        <VStack spacing={8} textAlign="center">
          <Box>
            <Text
              fontSize="sm"
              fontWeight="700"
              color="brand.300"
              letterSpacing="0.08em"
              textTransform="uppercase"
              mb={3}
            >
              RepoRadar
            </Text>
            <Heading
              as="h1"
              size={{ base: 'xl', md: '2xl' }}
              letterSpacing="-0.04em"
              maxW="720px"
              mx="auto"
              mb={4}
            >
              Understand any GitHub repository in minutes
            </Heading>
            <Text color="gray.400" maxW="600px" mx="auto" fontSize={{ base: 'md', md: 'lg' }}>
              Structured AI analysis reports and repository chat — built for developers who need signal, not noise.
            </Text>
          </Box>

          <Box
            as="form"
            onSubmit={handleSubmit}
            w="full"
            maxW="720px"
            borderWidth="1px"
            borderColor="whiteAlpha.200"
            bg="surface.200"
            borderRadius="lg"
            p={{ base: 4, md: 5 }}
          >
            <Flex gap={3} direction={{ base: 'column', sm: 'row' }}>
              <Input
                placeholder={DEMO_REPO_URL}
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                size="lg"
                aria-label="GitHub repository URL"
              />
              <Button type="submit" size="lg" leftIcon={<FaSearch />} minW={{ sm: '140px' }}>
                Continue
              </Button>
            </Flex>
            <Text fontSize="sm" color="gray.500" mt={3} textAlign="left">
              Suggested demo repo:{' '}
              <Button
                variant="link"
                colorScheme="teal"
                size="sm"
                onClick={() => setRepoUrl(DEMO_REPO_URL)}
              >
                {DEMO_REPO_LABEL}
              </Button>
            </Text>
          </Box>

          {analyzedRepo && (
            <Box
              id="repository-actions-container"
              w="full"
              maxW="720px"
              borderWidth="1px"
              borderColor="brand.700"
              bg="surface.200"
              borderRadius="lg"
              p={5}
              textAlign="left"
            >
              <Text fontSize="sm" color="gray.400" mb={1}>
                Selected repository
              </Text>
              <Text fontWeight="700" mb={4} wordBreak="break-all">
                {analyzedRepo}
              </Text>
              <SimpleGrid columns={{ base: 1, sm: 2 }} gap={3}>
                <Button onClick={goAnalyze} size="lg">
                  Analyze repository
                </Button>
                <Button onClick={goChat} size="lg" variant="outline">
                  Chat with repo
                </Button>
              </SimpleGrid>
            </Box>
          )}
        </VStack>
      </Container>

      <Features />
      <HowItWorks />
      <SubscriptionPlans />
      <Footer />
    </Box>
  );
}
