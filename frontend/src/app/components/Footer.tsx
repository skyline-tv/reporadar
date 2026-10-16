'use client';

import {
  Box,
  Container,
  SimpleGrid,
  Stack,
  Text,
  Link,
  Heading,
  HStack,
  Icon,
  Divider,
} from '@chakra-ui/react';
import { FaGithub, FaTwitter, FaLinkedin, FaHeart } from 'react-icons/fa';
import NextLink from 'next/link';

export default function Footer() {
  return (
    <Box
      as="footer"
      bg="surface.400"
      color="gray.400"
      borderTopWidth="1px"
      borderColor="whiteAlpha.200"
      mt={16}
    >
      <Container maxW="container.xl" py={12}>
        <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={8} mb={8}>
          <Stack spacing={4}>
            <HStack spacing={2}>
              <Icon as={FaGithub} color="brand.400" boxSize={6} />
              <Heading size="md" color="white">
                RepoRadar
              </Heading>
            </HStack>
            <Text fontSize="sm" lineHeight="1.7" maxW="sm">
              AI-assisted GitHub analysis and repository chat for developers.
            </Text>
            <HStack spacing={3}>
              <Link href="https://github.com/zuberkhan01st" isExternal aria-label="GitHub">
                <Icon as={FaGithub} boxSize={5} _hover={{ color: 'white' }} />
              </Link>
              <Link href="https://twitter.com/zuberkhan01st" isExternal aria-label="Twitter">
                <Icon as={FaTwitter} boxSize={5} _hover={{ color: 'white' }} />
              </Link>
              <Link href="https://linkedin.com/in/zuberkhan01st" isExternal aria-label="LinkedIn">
                <Icon as={FaLinkedin} boxSize={5} _hover={{ color: 'white' }} />
              </Link>
            </HStack>
          </Stack>

          <Stack align="flex-start" spacing={3}>
            <Heading size="sm" color="white">
              Product
            </Heading>
            <Link as={NextLink} href="/#features" fontSize="sm" _hover={{ color: 'brand.300' }}>
              Features
            </Link>
            <Link as={NextLink} href="/#how-it-works" fontSize="sm" _hover={{ color: 'brand.300' }}>
              How it works
            </Link>
            <Link as={NextLink} href="/#pricing" fontSize="sm" _hover={{ color: 'brand.300' }}>
              Pricing
            </Link>
            <Link as={NextLink} href="/dashboard" fontSize="sm" _hover={{ color: 'brand.300' }}>
              Dashboard
            </Link>
          </Stack>

          <Stack align="flex-start" spacing={3}>
            <Heading size="sm" color="white">
              Account
            </Heading>
            <Link as={NextLink} href="/login" fontSize="sm" _hover={{ color: 'brand.300' }}>
              Log in
            </Link>
            <Link as={NextLink} href="/signup" fontSize="sm" _hover={{ color: 'brand.300' }}>
              Sign up
            </Link>
            <Link as={NextLink} href="/history" fontSize="sm" _hover={{ color: 'brand.300' }}>
              History
            </Link>
            <Link as={NextLink} href="/contact" fontSize="sm" _hover={{ color: 'brand.300' }}>
              Contact
            </Link>
          </Stack>

          <Stack align="flex-start" spacing={3}>
            <Heading size="sm" color="white">
              Legal
            </Heading>
            <Link as={NextLink} href="/privacy" fontSize="sm" _hover={{ color: 'brand.300' }}>
              Privacy
            </Link>
            <Link as={NextLink} href="/terms" fontSize="sm" _hover={{ color: 'brand.300' }}>
              Terms
            </Link>
            <Link as={NextLink} href="/refund" fontSize="sm" _hover={{ color: 'brand.300' }}>
              Refunds
            </Link>
            <Link as={NextLink} href="/shipping" fontSize="sm" _hover={{ color: 'brand.300' }}>
              Shipping
            </Link>
          </Stack>
        </SimpleGrid>

        <Divider borderColor="whiteAlpha.200" mb={6} />
        <Text fontSize="sm" textAlign="center">
          © {new Date().getFullYear()} RepoRadar. Made with{' '}
          <Icon as={FaHeart} color="red.400" mx={1} aria-hidden /> by{' '}
          <Link href="https://www.linkedin.com/in/zuber-khan-01st/" isExternal color="brand.300">
            Zuber Khan
          </Link>
        </Text>
      </Container>
    </Box>
  );
}
