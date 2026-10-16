'use client';

import {
  Box,
  Container,
  VStack,
  Input,
  Text,
  Flex,
  useToast,
  IconButton,
  Heading,
  HStack,
  Avatar,
  Button,
  Code,
  Tooltip,
  Spinner,
} from '@chakra-ui/react';
import { FaPaperPlane, FaRobot, FaUser, FaCopy, FaCheck } from 'react-icons/fa';
import { SiGithub } from 'react-icons/si';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState, useRef, useEffect } from 'react';
import { apiUrl } from '@/lib/api';
import AppNav from '../components/AppNav';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      aria-label="Copy code"
      icon={copied ? <FaCheck /> : <FaCopy />}
      size="xs"
      position="absolute"
      top={2}
      right={2}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    />
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedRepoUrl = localStorage.getItem('analyzedRepo');
    if (!token) {
      localStorage.setItem('lastAction', 'chat');
      router.push('/login');
      return;
    }
    if (!storedRepoUrl) {
      router.push('/dashboard');
      return;
    }
    setRepoUrl(storedRepoUrl);
    const [owner, repo] = storedRepoUrl.split('/').slice(-2);
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `Ready to help with **${owner}/${repo}**. Ask about structure, commits, files, or architecture.`,
        timestamp: new Date(),
      },
    ]);
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const redirectToLogin = (description: string) => {
    localStorage.removeItem('token');
    localStorage.setItem('lastAction', 'chat');
    toast({ title: 'Session expired', description, status: 'warning', duration: 4000, isClosable: true });
    router.push('/login');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !repoUrl) return;
    const token = localStorage.getItem('token');
    if (!token) {
      redirectToLogin('Please log in again to continue chatting.');
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    const sessionSnapshot = messages
      .filter((m) => m.id !== 'welcome')
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);

    try {
      const response = await fetch(apiUrl('/users/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question: userMessage,
          repoUrl,
          sessionMessages: sessionSnapshot,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        redirectToLogin(data.error === 'Token expired' ? 'Your session has expired.' : 'Please log in again.');
        return;
      }
      if (!response.ok) {
        const code = data.code || '';
        if (code === 'GROQ_NOT_CONFIGURED' || response.status === 503) {
          throw new Error(
            data.message ||
              'AI chat is not configured. Ask the demo host to set GROQ_API_KEY on the backend.'
          );
        }
        throw new Error(data.message || data.error || 'Failed to get a response from the AI');
      }

      let finalResponse = typeof data.message === 'string' ? data.message : 'No response from AI';
      try {
        const parsed = JSON.parse(finalResponse);
        if (parsed?.response) finalResponse = parsed.response;
      } catch {
        /* plain text */
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: String(finalResponse).trim() || 'No response from AI',
          timestamp: new Date(),
        },
      ]);
    } catch (error: any) {
      const errText = error?.message || 'Failed to get a response from the AI';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `I could not complete that request.\n\n${errText}`,
          timestamp: new Date(),
        },
      ]);
      toast({ title: 'Chat unavailable', description: errText, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setIsLoading(false);
    }
  };

  const repoLabel = repoUrl ? repoUrl.split('/').slice(-2).join('/') : '';

  if (!repoUrl) return null;

  return (
    <Box minH="100vh" bg="surface.500" display="flex" flexDirection="column">
      <AppNav />
      <Container maxW="container.lg" flex="1" display="flex" flexDirection="column" py={4} px={{ base: 3, md: 6 }}>
        <Box
          borderWidth="1px"
          borderColor="whiteAlpha.200"
          bg="surface.200"
          borderRadius="lg"
          p={4}
          mb={4}
        >
          <Flex justify="space-between" align="center" gap={3} wrap="wrap">
            <HStack spacing={3} minW={0}>
              <Avatar size="sm" icon={<SiGithub />} bg="blackAlpha.600" />
              <Box minW={0}>
                <Heading size="sm" noOfLines={1}>
                  {repoLabel}
                </Heading>
                <Text fontSize="xs" color="gray.400" noOfLines={1}>
                  Repository chat context
                </Text>
              </Box>
            </HStack>
            <HStack>
              <Button
                as="a"
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                variant="outline"
                leftIcon={<SiGithub />}
              >
                GitHub
              </Button>
              <Button size="sm" variant="ghost" onClick={() => router.push('/dashboard')}>
                Dashboard
              </Button>
            </HStack>
          </Flex>
        </Box>

        <Box
          flex="1"
          overflowY="auto"
          borderWidth="1px"
          borderColor="whiteAlpha.200"
          borderRadius="lg"
          bg="surface.300"
          px={{ base: 3, md: 4 }}
          py={4}
          mb={4}
          minH={{ base: '50vh', md: '60vh' }}
        >
          <VStack spacing={4} align="stretch">
            {messages.map((message, index) => (
              <Flex
                key={message.id || index}
                justify={message.role === 'user' ? 'flex-end' : 'flex-start'}
                gap={3}
              >
                {message.role === 'assistant' && (
                  <Avatar size="sm" icon={<FaRobot />} bg="brand.600" color="gray.900" />
                )}
                <Box
                  maxW={{ base: '92%', md: '75%' }}
                  bg={message.role === 'user' ? 'brand.600' : 'surface.100'}
                  color={message.role === 'user' ? 'gray.900' : 'gray.100'}
                  px={4}
                  py={3}
                  borderRadius="lg"
                  borderWidth="1px"
                  borderColor={message.role === 'user' ? 'brand.500' : 'whiteAlpha.200'}
                >
                  {message.role === 'assistant' ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => (
                          <Text fontSize="sm" lineHeight="1.65" my={1}>
                            {children}
                          </Text>
                        ),
                        code: ({ className, children }) => {
                          const inline = !className;
                          const text = String(children).replace(/\n$/, '');
                          if (inline) {
                            return (
                              <Code fontSize="0.85em" bg="blackAlpha.500" color="brand.200">
                                {text}
                              </Code>
                            );
                          }
                          return (
                            <Box position="relative" my={3}>
                              <Box
                                as="pre"
                                p={3}
                                bg="blackAlpha.600"
                                borderRadius="md"
                                overflowX="auto"
                                fontSize="sm"
                                fontFamily="mono"
                              >
                                <code>{text}</code>
                              </Box>
                              <CopyButton text={text} />
                            </Box>
                          );
                        },
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    <Text fontSize="sm" fontWeight="600">
                      {message.content}
                    </Text>
                  )}
                  <Text fontSize="xs" mt={2} opacity={0.65} textAlign="right">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </Text>
                </Box>
                {message.role === 'user' && (
                  <Avatar size="sm" icon={<FaUser />} bg="gray.600" />
                )}
              </Flex>
            ))}
            {isLoading && (
              <HStack color="gray.400" fontSize="sm" pl={12} spacing={3} role="status" aria-live="polite">
                <Spinner size="sm" color="brand.400" />
                <Text>Fetching context and generating a reply…</Text>
              </HStack>
            )}
            <div ref={messagesEndRef} />
          </VStack>
        </Box>

        <Box
          as="form"
          onSubmit={handleSubmit}
          borderWidth="1px"
          borderColor="whiteAlpha.200"
          bg="surface.200"
          borderRadius="lg"
          p={3}
        >
          <Flex gap={2}>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about files, commits, architecture…"
              size="lg"
              isDisabled={isLoading}
              aria-label="Chat message"
            />
            <Tooltip label="Send">
              <IconButton
                type="submit"
                aria-label="Send message"
                icon={<FaPaperPlane />}
                colorScheme="teal"
                size="lg"
                isLoading={isLoading}
                isDisabled={isLoading || !input.trim()}
              />
            </Tooltip>
          </Flex>
        </Box>
      </Container>
    </Box>
  );
}
